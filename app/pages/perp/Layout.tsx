import { Outlet } from "react-router-dom";
import { Scaffold } from "@orderly.network/ui-scaffold";
import { useOrderlyConfig } from "@/utils/config";
import { useNav } from "@/hooks/useNav";

export default function PerpLayout() {
  const config = useOrderlyConfig();
  const { onRouteChange } = useNav();

  return (
    <Scaffold
      mainNavProps={config.scaffold.mainNavProps}
      footerProps={config.scaffold.footerProps}
      footer={config.scaffold.footer}
      routerAdapter={{
        onRouteChange,
        currentPath: "/",
      }}
      bottomNavProps={config.scaffold.bottomNavProps}
    >
      <Outlet />
    </Scaffold>
  );
}
