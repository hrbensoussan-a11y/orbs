import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Rendu Markdown sûr : react-markdown n'interprète PAS le HTML brut par
// défaut (pas de rehype-raw), donc pas d'injection possible via le contenu.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="reading">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
