import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { Gallery } from "./pages/Gallery";
import { Market } from "./pages/Market";
import { Alerts } from "./pages/Alerts";
import { SymbolPage } from "./pages/Symbol";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/market" replace />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/market" element={<Market />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/symbol/:ticker" element={<SymbolPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
