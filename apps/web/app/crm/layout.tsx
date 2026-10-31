import { CrmNav } from "@agency/crm";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CrmNav />
      {children}
    </>
  );
}
