"use client";

import dynamic from "next/dynamic";

const TeamSheetParser = dynamic(() => import("../components/TeamSheetParser"), { ssr: false });

export default function TeamSheetClient() {
  return <TeamSheetParser />;
}
