import { quotationTermsPresentation } from '@/src/application/document/quotation-terms-presentation';

export function QuotationTerms({ text }: { text: string }) {
  const presentation = quotationTermsPresentation(text);
  return presentation.clauses
    ? <ol className="list-decimal space-y-2 ps-6 leading-7">{presentation.clauses.map((clause, index) => <li key={index} className="whitespace-pre-wrap">{clause}</li>)}</ol>
    : <p className="whitespace-pre-wrap leading-7">{text}</p>;
}
