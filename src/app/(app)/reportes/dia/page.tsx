import { requireProfile } from "@/lib/auth";
import { todayCR } from "@/lib/format";
import ReporteDia from "./ReporteDia";

export const dynamic = "force-dynamic";

export default async function ReporteDiaPage() {
  const profile = await requireProfile();

  return <ReporteDia role={profile.role} today={todayCR()} />;
}
