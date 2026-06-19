import { redirect } from "next/navigation";

// The assistant now lives in the persistent right-hand panel, available on
// every screen. Keep this path working for old links.
export default function ChatPage() {
  redirect("/app");
}
