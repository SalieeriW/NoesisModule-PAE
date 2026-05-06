import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  addOperatorRecord,
  getActiveOperatorId,
  getOperatorById,
  loadOperators,
  removeOperator,
  saveOperators,
  setActiveOperatorId
} from "../lib/operatorRegistry";

const OperatorContext = createContext(null);

export function OperatorProvider({ children }) {
  const [operators, setOperatorsState] = useState(() => loadOperators());
  const [activeId, setActiveIdState] = useState(() => getActiveOperatorId());

  const refresh = useCallback(() => {
    setOperatorsState(loadOperators());
  }, []);

  const activeOperator = useMemo(
    () => (activeId ? getOperatorById(activeId) : null),
    [activeId, operators]
  );

  const selectOperator = useCallback((id) => {
    setActiveOperatorId(id);
    setActiveIdState(id);
  }, []);

  const signOut = useCallback(() => {
    setActiveOperatorId(null);
    setActiveIdState(null);
  }, []);

  const registerOperator = useCallback((payload) => {
    const result = addOperatorRecord(payload);
    if (result.ok) refresh();
    return result;
  }, [refresh]);

  const deleteOperator = useCallback((id) => {
    removeOperator(id);
    refresh();
    if (activeId === id) setActiveIdState(getActiveOperatorId());
  }, [activeId, refresh]);

  const value = useMemo(
    () => ({
      operators,
      activeOperator,
      activeOperatorId: activeId,
      selectOperator,
      signOut,
      registerOperator,
      deleteOperator,
      refresh
    }),
    [operators, activeOperator, activeId, selectOperator, signOut, registerOperator, deleteOperator, refresh]
  );

  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>;
}

export function useOperator() {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used under OperatorProvider");
  return ctx;
}
