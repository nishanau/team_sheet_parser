import Nav from "../components/Nav";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <div style={{ paddingTop: "72px", paddingLeft: "28px", paddingRight: "28px", paddingBottom: "28px" }}>
        {children}
      </div>
    </>
  );
}
