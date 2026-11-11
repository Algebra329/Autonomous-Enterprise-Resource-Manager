export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  type: "approval" | "executed" | "blocked" | "policy" | "system";
  read: boolean;
  destination: string;
};

export const pendingApprovalCount = 3;

export const initialNotifications: NotificationItem[] = [
  {
    id: "notification-1",
    title: "Purchase awaiting approval",
    message: "Software licensing · Vendor B · $12,500",
    time: "5 minutes ago",
    type: "approval",
    read: false,
    destination: "/approvals",
  },
  {
    id: "notification-2",
    title: "Purchase automatically executed",
    message: "Cloud infrastructure · Vendor A · $4,200",
    time: "32 minutes ago",
    type: "executed",
    read: false,
    destination: "/audit",
  },
  {
    id: "notification-3",
    title: "Procurement attempt blocked",
    message: "Hardware purchase violated an active policy",
    time: "1 hour ago",
    type: "blocked",
    read: false,
    destination: "/audit",
  },
  {
    id: "notification-4",
    title: "Procurement policy updated",
    message: "A workspace administrator updated a purchasing policy",
    time: "3 hours ago",
    type: "policy",
    read: true,
    destination: "/policies",
  },
  {
    id: "notification-5",
    title: "Governance system operational",
    message: "All illustrative procurement controls are active",
    time: "Yesterday",
    type: "system",
    read: true,
    destination: "/dashboard",
  },
];

export const searchableItems = [
  {
    id: "dashboard",
    title: "AG Studio",
    description: "Procurement overview and performance metrics",
    category: "Navigation",
    destination: "/dashboard",
  },
  {
    id: "policies",
    title: "Procurement Policies",
    description: "View and manage procurement policies",
    category: "Navigation",
    destination: "/policies",
  },
  {
    id: "approvals",
    title: "Approval Queue",
    description: "Review pending purchases and approval requests",
    category: "Navigation",
    destination: "/approvals",
  },
  {
    id: "arena",
    title: "Break-it Arena",
    description: "Test procurement rules and governance controls",
    category: "Navigation",
    destination: "/arena",
  },
  {
    id: "audit",
    title: "Audit & Proof",
    description: "Review procurement events and audit records",
    category: "Navigation",
    destination: "/audit",
  },
  {
    id: "purchase-1",
    title: "Cloud infrastructure purchase",
    description: "Vendor A · $4,200 · Executed",
    category: "Procurement activity",
    destination: "/audit",
  },
  {
    id: "purchase-2",
    title: "Software licensing purchase",
    description: "Vendor B · $12,500 · Pending approval",
    category: "Procurement activity",
    destination: "/approvals",
  },
  {
    id: "purchase-3",
    title: "Hardware purchase",
    description: "$8,900 · Blocked by policy",
    category: "Procurement activity",
    destination: "/audit",
  },
];