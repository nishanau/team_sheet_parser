"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./TeamSheetParser.module.css";
import Select from "./Select";

// ─── Types ────────────────────────────────────────────────────────────────────
type StatusState = "idle" | "work" | "ok" | "err";

interface MatchResult {
  name: string;
  found: boolean;
  row?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const LEAGUE_TEAMS: Record<string, string[]> = {
  "SFL Premier League": [
    "Brighton",
    "Clarence",
    "Glenorchy",
    "Kingborough Tigers",
    "Lauderdale",
    "North Hobart",
  ],
  "SFL Community League": [
    "Claremont",
    "Cygnet",
    "Dodges Ferry",
    "Hobart",
    "Huonville Lions",
    "Hutchins",
    "Lindisfarne",
    "New Norfolk",
    "Sorell",
    "St Virgils",
    "University",
  ],
};

const COMMUNITY_FEMALE_EXCLUSIONS = ["St Virgils", "University", "Hutchins"];

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getColumnLetter(col: number): string {
  let letter = "";
  while (col > 0) {
    const remainder = (col - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

// ─── DropZone sub-component ───────────────────────────────────────────────────
interface DropZoneProps {
  fileInputId: string;
  fileName: string;
  fileHint: string;
  onFile: (file: File) => void;
  accept: string;
}

function DropZone({ fileInputId, fileName, fileHint, onFile, accept }: DropZoneProps) {
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragover(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <>
      <input
        id={fileInputId}
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // reset so same file can be re-selected
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload file"
        className={`${styles.drop}${dragover ? " " + styles.dragover : ""}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragover(true); }}
        onDragOver={(e)  => { e.preventDefault(); e.stopPropagation(); setDragover(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragover(false); }}
        onDrop={handleDrop}
      >
        <div className={styles.badge}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <path d="M8 7l4-4 4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 14v4a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className={styles.filemeta}>
          <div className="title">{fileName}</div>
          <div className="hint">{fileHint}</div>
        </div>
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TeamSheetParser() {
  // Selection state
  const [selectedLeague, setSelectedLeague] = useState("SFL Premier League");
  const [selectedGender, setSelectedGender] = useState<"male" | "female">("male");
  const [selectedTeam, setSelectedTeam] = useState("Brighton");

  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfFileName, setPdfFileName] = useState("Click to choose a PDF or drag & drop");
  const [pdfFileHint, setPdfFileHint] = useState("Accepts .pdf");
  const [statusState, setStatusState] = useState<StatusState>("idle");
  const [statusText, setStatusText] = useState("No file selected");
  const [parsedRound, setParsedRound] = useState<string | null>(null);
  const [parsedPlayers, setParsedPlayers] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);

  // Excel state
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelFileName, setExcelFileName] = useState("Click to choose an Excel file or drag & drop");
  const [excelFileHint, setExcelFileHint] = useState("Accepts .xlsx or .xls");
  const [playersUpdated, setPlayersUpdated] = useState<number | null>(null);
  const [roundColumn, setRoundColumn] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [updatedWorkbook, setUpdatedWorkbook] = useState<any>(null);
  const [updatingExcel, setUpdatingExcel] = useState(false);

  // Derived team list
  const getTeams = useCallback((league: string, gender: string) => {
    let teams = LEAGUE_TEAMS[league] || [];
    if (league === "SFL Community League" && gender === "female") {
      teams = teams.filter((t) => !COMMUNITY_FEMALE_EXCLUSIONS.includes(t));
    }
    return teams;
  }, []);

  // When league/gender changes, reset team to first available
  useEffect(() => {
    const teams = getTeams(selectedLeague, selectedGender);
    setSelectedTeam(teams[0] || "");
  }, [selectedLeague, selectedGender, getTeams]);

  // ── PDF reset ──────────────────────────────────────────────────────────────
  function resetPdf() {
    setPdfFile(null);
    setPdfFileName("Click to choose a PDF or drag & drop");
    setPdfFileHint("Accepts .pdf");
    setParsedRound(null);
    setParsedPlayers([]);
    setStatusState("idle");
    setStatusText("No file selected");
    resetExcel();
  }

  function handlePdfFile(file: File) {
    const name = (file.name || "").toLowerCase();
    const isValid = name.endsWith(".pdf") || file.type === "application/pdf";
    if (!isValid) {
      setStatusState("err");
      setStatusText("That file is not a PDF");
      setPdfFileName(file.name || "Unknown file");
      setPdfFileHint("Please choose a .pdf file");
      return;
    }
    setPdfFile(file);
    setPdfFileName(file.name);
    setPdfFileHint(`${Math.round(file.size / 1024)} KB`);
    setStatusState("ok");
    setStatusText("Ready to parse");
  }

  // ── Excel reset ────────────────────────────────────────────────────────────
  function resetExcel() {
    setExcelFile(null);
    setExcelFileName("Click to choose an Excel file or drag & drop");
    setExcelFileHint("Accepts .xlsx or .xls");
    setMatchResults([]);
    setPlayersUpdated(null);
    setRoundColumn(null);
    setUpdatedWorkbook(null);
  }

  function handleExcelFile(file: File) {
    const name = (file.name || "").toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      alert("Please select a valid Excel file (.xlsx or .xls)");
      setExcelFileName(file.name || "Unknown file");
      setExcelFileHint("Please choose a .xlsx or .xls file");
      return;
    }
    setExcelFile(file);
    setExcelFileName(file.name);
    setExcelFileHint(`${Math.round(file.size / 1024)} KB`);
  }

  // ── Parse PDF ──────────────────────────────────────────────────────────────
  async function handleParse() {
    if (!pdfFile || parsing) return;
    setParsing(true);
    setStatusState("work");
    setStatusText("Parsing PDF…");

    try {
      // Use named exports — pdfjs-dist v4+ no longer has a default export
      const pdfjsLib = await import("pdfjs-dist");
      // Serve worker from /public so no CDN fetch is needed
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        const page = await pdf.getPage(pageNo);
        const tc = await page.getTextContent();
        const pageText = (tc.items as Array<{ str: string }>)
          .map((it) => it.str)
          .join(" ");
        fullText += "\n" + pageText;
      }

      const normalized = fullText
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim();

      // Round extraction: "4 ROUND" or "ROUND 4"
      let roundMatch = normalized.match(/\b([0-9]{1,2})\s+ROUND\b/i);
      if (!roundMatch) {
        roundMatch = normalized.match(/\bROUND\b\s*([0-9]{1,2})/i);
      }
      const round = roundMatch ? roundMatch[1] : null;

      // Team block extraction
      const genderWord = selectedGender === "female" ? "Women" : "Men";
      const teamNameRegex = new RegExp(
        `TEAM\\s+([AB]):\\s*${escapeRegExp(selectedTeam)}\\s*Senior\\s*${genderWord}`,
        "i"
      );
      const teamMatch = normalized.match(teamNameRegex);
      if (!teamMatch) {
        throw new Error(
          `Could not find 'TEAM : ${selectedTeam} Senior ${genderWord}'`
        );
      }

      const startIdx = teamMatch.index!;
      const afterStart = normalized.slice(startIdx);
      const endIdx = afterStart.search(/\b(COACH:|PP\s+GOALS\s+BEHINDS)\b/i);
      const teamBlock = endIdx !== -1 ? afterStart.slice(0, endIdx) : afterStart;

      console.log("=== TEAM BLOCK (first 1500 chars) ===");
      console.log(teamBlock.slice(0, 1500));
      console.log("=== END TEAM BLOCK ===");

      // Extract player entries
      // Pattern: "1 Chris P. Bacon (vc) 1 2 Max Skelly 2 ..."
      const playerRegex =
        /\b(\d+)\s+([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|[A-Z]\.|[A-Z]))*)\s+([A-Z][a-z]+(?:['.\-][A-Z][a-z]+)*)(?:\s+\(([^)]+)\))?\s+\d+/gi;

      const players: string[] = [];
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      let matchCount = 0;

      while ((m = playerRegex.exec(teamBlock)) !== null) {
        matchCount++;
        const rowNum = m[1].trim();
        const nameParts = m[2].trim().split(/\s+/);
        const firstName = nameParts[0];
        const middleNames = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
        const lastName = m[3].trim();
        const role = m[4] ? m[4].trim() : "";

        const displayName = middleNames
          ? `${firstName} ${middleNames} ${lastName}`
          : `${firstName} ${lastName}`;

        console.log(`Match ${matchCount}: [${rowNum}] [${displayName}] [(${role})]`);

        if (
          /^(NO|PLAYERS|PLAYER|SIGNATURES|PP|GOALS|BEHINDS|BEST|YEL|CARD|RED|TEAM|TIME|pm|am)$/i.test(firstName) ||
          /^(NO|PLAYERS|PLAYER|SIGNATURES|PP|GOALS|BEHINDS|BEST|YEL|CARD|RED|TEAM|TIME|pm|am)$/i.test(lastName)
        ) {
          console.log("  -> Skipped (header word or invalid)");
          continue;
        }

        if (rowNum === "00" || parseInt(rowNum) === 0) {
          console.log("  -> Skipped (invalid row number)");
          continue;
        }

        if (role.toLowerCase().includes("emg")) {
          console.log("  -> Skipped (emergency player)");
          continue;
        }

        if (!seen.has(displayName)) {
          seen.add(displayName);
          players.push(displayName);
          console.log(`  -> Added: ${displayName}`);
        } else {
          console.log("  -> Skipped (duplicate)");
        }
      }

      console.log(`Total matches found: ${matchCount}, Players added: ${players.length}`);

      setParsedRound(round);
      setParsedPlayers(players);
      setStatusState("ok");
      setStatusText("Parsed successfully");
    } catch (err) {
      setStatusState("err");
      setStatusText((err as Error)?.message || String(err));
    } finally {
      setParsing(false);
    }
  }

  // ── Update Excel ───────────────────────────────────────────────────────────
  async function handleUpdateExcel() {
    if (!excelFile || !parsedPlayers.length || !parsedRound || updatingExcel) {
      alert("Missing required data");
      return;
    }
    setUpdatingExcel(true);

    try {
      console.log("=== EXCEL UPDATE STARTED ===");
      console.log(`Parsed Players (${parsedPlayers.length}):`, parsedPlayers);
      console.log(`Parsed Round: ${parsedRound}`);

      // ExcelJS v4 uses named exports
      const ExcelJS = await import("exceljs");
      const arrayBuffer = await excelFile.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const sheetName = "Men Rnd-by-Rnd";
      const availableSheets = workbook.worksheets.map((ws) => ws.name);
      console.log("Available sheets:", availableSheets);
      console.log(`Looking for sheet: "${sheetName}"`);

      const worksheet = workbook.getWorksheet(sheetName);
      if (!worksheet) {
        throw new Error(
          `Could not find sheet "${sheetName}". Available sheets: ${availableSheets.join(", ")}`
        );
      }

      console.log(`Total rows in Excel: ${worksheet.rowCount}`);

      if (worksheet.rowCount < 4) {
        throw new Error("Excel file doesn't have enough rows");
      }

      // Find the round column (row 3)
      const headerRow = worksheet.getRow(3);
      const headerValues: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headerValues[colNumber - 1] = cell.value ? String(cell.value).trim() : "";
      });
      console.log("Row 3 (Round headers):", headerValues);

      const targetRoundText = `Rnd ${parsedRound}`;
      console.log(`Searching for: "${targetRoundText}"`);

      let roundColIndex = -1;
      for (let i = 0; i < headerValues.length; i++) {
        if (headerValues[i] === targetRoundText) {
          roundColIndex = i + 1; // ExcelJS 1-based
          console.log(`Found "${targetRoundText}" at column ${roundColIndex}`);
          break;
        }
      }

      if (roundColIndex === -1) {
        console.log("Available round headers:", headerValues.filter((h) => String(h).includes("Rnd")));
        throw new Error(`Could not find "${targetRoundText}" in Excel header row`);
      }

      const roundColLetter = getColumnLetter(roundColIndex);
      console.log(`Round column: ${roundColLetter} (index ${roundColIndex})`);
      setRoundColumn(roundColLetter);

      let updateCount = 0;
      const results: MatchResult[] = [];
      const foundPlayers = new Set<string>();

      console.log("\n=== MATCHING PLAYERS ===");

      // Column C (3) = First Name, Column D (4) = Last Name
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 3) return;

        const firstName = row.getCell(3).value
          ? String(row.getCell(3).value).trim()
          : "";
        const lastName = row.getCell(4).value
          ? String(row.getCell(4).value).trim()
          : "";
        if (!firstName || !lastName) return;

        const fullName = `${firstName} ${lastName}`;

        if (parsedPlayers.includes(fullName)) {
          row.getCell(roundColIndex).value = 1;
          updateCount++;
          foundPlayers.add(fullName);
          results.push({ name: fullName, found: true, row: rowNumber });
          console.log(`Row ${rowNumber}: ${fullName} - UPDATED (set to 1)`);
        } else {
          if (updateCount + (rowNumber - 4) < 30) {
            console.log(`Row ${rowNumber}: ${fullName} - not in PDF list`);
          }
        }
      });

      // Players from PDF not found in Excel
      parsedPlayers.forEach((player) => {
        if (!foundPlayers.has(player)) {
          results.push({ name: player, found: false });
        }
      });

      console.log(`\nTotal players updated: ${updateCount}`);

      setMatchResults(results);
      setPlayersUpdated(updateCount);
      setUpdatedWorkbook(workbook);

      console.log("=== EXCEL UPDATE COMPLETED ===\n");
      alert(`Successfully updated ${updateCount} player(s) in ${targetRoundText}!`);
    } catch (err) {
      alert(`Error updating Excel: ${(err as Error).message}`);
      console.error(err);
    } finally {
      setUpdatingExcel(false);
    }
  }

  // ── Download Excel ─────────────────────────────────────────────────────────
  async function handleDownloadExcel() {
    if (!updatedWorkbook || !excelFile) return;
    try {
      const buffer = await updatedWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `updated_${excelFile.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error downloading Excel: ${(err as Error).message}`);
      console.error(err);
    }
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const teams = getTeams(selectedLeague, selectedGender);
  const showExcelSection = parsedPlayers.length > 0 && parsedRound !== null;
  const parseBtnDisabled = !pdfFile || parsing;
  const clearPdfBtnDisabled = !pdfFile;

  const dotClass =
    statusState === "ok" ? styles.dotOk :
    statusState === "err" ? styles.dotErr :
    statusState === "work" ? styles.dotWork :
    styles.dotIdle;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={`${styles.container} ${styles.card}`}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h1>Team Sheet PDF Parser</h1>
          <div className={styles.sub}>
            Upload a team sheet PDF and extract the player names and the{" "}
            <strong>Round</strong> number.
          </div>
        </div>
        <div className={styles.pill}>
          <span className={`${styles.dot} ${dotClass}`} />
          <span>{statusText}</span>
        </div>
      </div>

      {/* ── Selection Controls ── */}
      <div className={styles.selectionBar}>
        <div className={styles.selectionRow}>
          <div className={styles.selectGroup} style={{ minWidth: 180 }}>
            <label htmlFor="leagueSelect" className={styles.selectLabel}>League</label>
            <Select
              id="leagueSelect"
              value={selectedLeague}
              onChange={(v) => setSelectedLeague(v)}
              options={["SFL Premier League", "SFL Community League"]}
            />
          </div>

          <div className={styles.selectGroup} style={{ minWidth: 120 }}>
            <label htmlFor="genderSelect" className={styles.selectLabel}>Gender</label>
            <Select
              id="genderSelect"
              value={selectedGender}
              onChange={(v) => setSelectedGender(v as "male" | "female")}
              options={[
                { label: "Male", value: "male" },
                { label: "Female", value: "female" },
              ]}
            />
          </div>

          <div className={styles.selectGroup} style={{ minWidth: 180 }}>
            <label htmlFor="teamSelect" className={styles.selectLabel}>Team</label>
            <Select
              id="teamSelect"
              value={selectedTeam}
              onChange={(v) => setSelectedTeam(v)}
              options={teams}
            />
          </div>
        </div>
      </div>

      {/* ── PDF Upload + Controls ── */}
      <div className={styles.grid}>
        <DropZone
          fileInputId="pdfFile"
          fileName={pdfFileName}
          fileHint={pdfFileHint}
          onFile={handlePdfFile}
          accept="application/pdf"
        />

        <div className={styles.controls}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={parseBtnDisabled}
            onClick={handleParse}
          >
            {parsing ? "Parsing…" : "Parse PDF"}
          </button>
          <button
            className={styles.btn}
            disabled={clearPdfBtnDisabled}
            onClick={() => {
              if (confirm("Clear PDF and all parsed data? This will reset everything.")) {
                resetPdf();
              }
            }}
          >
            Clear PDF
          </button>

          <div className={styles.statrow}>
            <div className={styles.stat}>
              <div className={styles.statKey}>Round</div>
              <div className={styles.statVal}>{parsedRound ?? "—"}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statKey}>Players found</div>
              <div className={styles.statVal}>{parsedPlayers.length > 0 ? parsedPlayers.length : "—"}</div>
            </div>
          </div>

          <div className={styles.hintText}>
            If parsing fails, open the browser console and adjust anchors/regex to match how your PDF text is emitted.
          </div>
        </div>
      </div>

      {/* ── Player List ── */}
      <div className={styles.out}>
        <div>
          <div className={styles.teamPlayersLabel} id="teamPlayersLabel" />
          <div className={styles.playerListWrap}>
            <ul className={styles.playerList}>
              {parsedPlayers.length > 0 ? (
                parsedPlayers.map((name) => <li key={name}>{name}</li>)
              ) : (
                <li style={{ opacity: 0.5 }}>No players found yet</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Excel Section ── */}
      {showExcelSection && (
        <div className={`${styles.excelSection} ${styles.card}`}>
          <div className={styles.header}>
            <div>
              <div className={styles.sectionTitle}>Step 2: Update Excel Tracker</div>
              <div className={styles.sub}>
                Upload your player tracking Excel file to mark attendance for the players found in the PDF.
              </div>
            </div>
          </div>

          <div className={styles.grid}>
            <DropZone
              fileInputId="excelFile"
              fileName={excelFileName}
              fileHint={excelFileHint}
              onFile={handleExcelFile}
              accept=".xlsx,.xls"
            />

            <div className={styles.controls}>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={!excelFile || updatingExcel}
                onClick={handleUpdateExcel}
              >
                {updatingExcel ? "Updating…" : "Update Excel"}
              </button>
              <button
                className={styles.btn}
                disabled={!updatedWorkbook}
                onClick={handleDownloadExcel}
              >
                Download Updated Excel
              </button>
              <button
                className={styles.btn}
                disabled={!excelFile}
                onClick={() => {
                  if (confirm("Clear Excel file and results?")) resetExcel();
                }}
              >
                Clear Excel
              </button>

              <div className={styles.statrow}>
                <div className={styles.stat}>
                  <div className={styles.statKey}>Players Updated</div>
                  <div className={styles.statVal}>{playersUpdated !== null ? playersUpdated : "—"}</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.statKey}>Round Column</div>
                  <div className={styles.statVal}>{roundColumn ?? "—"}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Match results */}
          {matchResults.length > 0 && (
            <div className={styles.out}>
              <div>
                <div className={`${styles.muted}`} style={{ fontSize: 12, margin: "0 0 10px 2px" }}>
                  Excel Update Results
                </div>
                <div className={styles.matchResultsWrap}>
                  {matchResults.map((r, i) => (
                    <div
                      key={i}
                      className={`${styles.matchResult}${r.found ? "" : " " + styles.notFound}`}
                    >
                      {r.found
                        ? `✓ ${r.name} (Row ${r.row})`
                        : `✗ ${r.name} (not found in Excel)`}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
