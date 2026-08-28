// Isolated visual fixture: never navigate to a real commercial form.
export const useRouter = () => ({ push: (path: string) => { if (path === '/dashboard/quotations/new') window.dispatchEvent(new Event('preview-quotation')); } });
