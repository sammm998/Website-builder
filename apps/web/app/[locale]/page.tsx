import Link from "next/link";
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <main className="p-12"><Link href={`/${locale}/login`}>Login</Link></main>;
}
