import React, { createContext, PropsWithChildren, useContext } from "react";
import { TabKey } from "../types";

interface NavigationValue {
  tab: TabKey;
  navigate: (tab: TabKey) => void;
}

const NavigationContext = createContext<NavigationValue | null>(null);

export function AppNavigationProvider({
  tab,
  navigate,
  children,
}: PropsWithChildren<NavigationValue>) {
  return (
    <NavigationContext.Provider value={{ tab, navigate }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useAppNavigation(): NavigationValue {
  const value = useContext(NavigationContext);
  if (!value) {
    throw new Error("useAppNavigation must be used inside AppNavigationProvider");
  }
  return value;
}
