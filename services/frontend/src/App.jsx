import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AnimatedBg } from "./components/AnimatedBg";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { AuthProvider } from "./context/AuthContext";
import { WorkbenchProvider } from "./context/WorkbenchContext";
import { History } from "./pages/History";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Register } from "./pages/Register";
import { Workcell } from "./pages/Workcell";

export function App() {
  return (
    <AuthProvider>
      <AnimatedBg />
      <WorkbenchProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected — inside AppShell */}
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<Overview />} />
                <Route path="/process" element={<Workcell />} />
                <Route path="/history" element={<History />} />
                {/* Legacy redirects */}
                <Route path="/simulation" element={<Navigate to="/dashboard" replace />} />
                <Route path="/inspection" element={<Navigate to="/process" replace />} />
                <Route path="/mask" element={<Navigate to="/process" replace />} />
                <Route path="/production" element={<Navigate to="/process" replace />} />
                <Route path="/chat" element={<Navigate to="/process" replace />} />
                <Route path="/activity" element={<Navigate to="/history" replace />} />
                <Route path="/team" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </WorkbenchProvider>
    </AuthProvider>
  );
}
