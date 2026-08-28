// Isolated visual fixture: never navigate to a real commercial form.
export const useRouter = () => ({ push: () => undefined });
