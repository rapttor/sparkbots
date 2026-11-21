import { useStore } from "../state/store";

/** Shown while agents follow you: how many, a button for the one-message-to-all chat, and a way to send them back. */
export function FollowBar() {
  const n = useStore((s) => s.followers.length);
  const clear = useStore((s) => s.clearFollowers);
  const meetingOpen = useStore((s) => s.meetingOpen);
  const setMeetingOpen = useStore((s) => s.setMeetingOpen);
  if (!n) return null;
  return (
    <div className="follow-bar">
      <span>👥 {n} following you</span>
      <button className="small" onClick={() => setMeetingOpen(!meetingOpen)}>{meetingOpen ? "Hide meeting chat" : "💬 Meeting chat"}</button>
      <button className="small" onClick={clear} title="Meeting over: release everyone and send them back to what they were doing (X)">Release all</button>
    </div>
  );
}
