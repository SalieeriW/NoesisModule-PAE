import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireOperator } from "./components/RequireOperator";
import { OperatorProvider } from "./context/OperatorContext";
import { WorkbenchProvider } from "./context/WorkbenchContext";
import { ActivityLog } from "./pages/ActivityLog";
import { Inspection } from "./pages/Inspection";
import { MaskReview } from "./pages/MaskReview";
import { Overview } from "./pages/Overview";
import { Production } from "./pages/Production";
import { Simulation } from "./pages/Simulation";
import { Team } from "./pages/Team";

function InspectionGate() {
  return (
    <RequireOperator>
      <Inspection />
    </RequireOperator>
  );
}

function MaskGate() {
  return (
    <RequireOperator>
      <MaskReview />
    </RequireOperator>
  );
}

function ProductionGate() {
  return (
    <RequireOperator>
      <Production />
    </RequireOperator>
  );
}

export function App() {
  return (
    <OperatorProvider>
      <WorkbenchProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Overview />} />
              <Route path="simulation" element={<Simulation />} />
              <Route path="inspection" element={<InspectionGate />} />
              <Route path="mask" element={<MaskGate />} />
              <Route path="production" element={<ProductionGate />} />
              <Route path="activity" element={<ActivityLog />} />
              <Route path="team" element={<Team />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WorkbenchProvider>
    </OperatorProvider>
  );
}
