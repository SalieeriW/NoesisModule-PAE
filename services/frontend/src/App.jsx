import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireOperator } from "./components/RequireOperator";
import { OperatorProvider } from "./context/OperatorContext";
import { WorkbenchProvider } from "./context/WorkbenchContext";
import { ActivityLog } from "./pages/ActivityLog";
import { Overview } from "./pages/Overview";
import { Simulation } from "./pages/Simulation";
import { Team } from "./pages/Team";
import { Workcell } from "./pages/Workcell";

function WorkcellGate() {
  return (
    <RequireOperator>
      <Workcell />
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
              <Route path="process" element={<WorkcellGate />} />
              <Route path="activity" element={<ActivityLog />} />
              <Route path="team" element={<Team />} />
              <Route path="inspection" element={<Navigate to="/process" replace />} />
              <Route path="mask" element={<Navigate to="/process" replace />} />
              <Route path="production" element={<Navigate to="/process" replace />} />
              <Route path="chat" element={<Navigate to="/process" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WorkbenchProvider>
    </OperatorProvider>
  );
}
