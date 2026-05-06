import { Navigate, useLocation } from "react-router-dom";
import { useOperator } from "../context/OperatorContext";

export function RequireOperator({ children }) {
  const { activeOperator } = useOperator();
  const loc = useLocation();

  if (!activeOperator) {
    return <Navigate to="/team" replace state={{ from: loc.pathname }} />;
  }
  return children;
}
