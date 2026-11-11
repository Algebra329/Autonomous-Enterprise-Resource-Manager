import { createBrowserRouter, Navigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import DashboardPage from "../pages/Dashboard";
import PoliciesPage from "../pages/PoliciesPage";
import ApprovalsPage from "../pages/ApprovalsPage";
import ArenaPage from "../pages/ArenaPage";
import AuditPage from "../pages/AuditPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: "dashboard",
        element: <DashboardPage />,
      },
      {
        path: "policies",
        element: <PoliciesPage />,
      },
      {
        path: "approvals",
        element: <ApprovalsPage />,
      },
      {
        path: "arena",
        element: <ArenaPage />,
      },
      {
        path: "audit",
        element: <AuditPage />,
      },
    ],
  },
]);