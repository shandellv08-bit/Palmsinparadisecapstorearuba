import Link from "next/link";

export default function NoAccess() {
  return (
    <>
      <h1>No access</h1>
      <p>Your role does not include this part of the dashboard. Ask the owner if you need it.</p>
      <Link href="/admin">Back to overview</Link>
    </>
  );
}
