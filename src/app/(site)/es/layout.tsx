/**
 * Spanish (es-US) section. The root <html lang> is "en"; this wrapper marks the content as Spanish
 * for assistive tech and search engines. (A dynamic root lang attribute is a follow-up.)
 */
export default function SpanishLayout({ children }: { children: React.ReactNode }) {
  return <div lang="es-US">{children}</div>;
}
