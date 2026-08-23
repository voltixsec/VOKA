import type { ISystemTemplate } from "./types";

export class SystemTemplateRegistry {
  private readonly templates = new Map<string, ISystemTemplate>();

  public constructor(templates: readonly ISystemTemplate[] = []) {
    for (const template of templates) this.register(template);
  }

  public register(template: ISystemTemplate): void {
    const key = template.systemType.toUpperCase();
    if (this.templates.has(key)) {
      throw new Error(`SYSTEM_TEMPLATE_ALREADY_REGISTERED: ${key}`);
    }
    this.templates.set(key, template);
  }

  public get(systemType: string): ISystemTemplate | undefined {
    return this.templates.get(systemType.toUpperCase());
  }

  public has(systemType: string): boolean {
    return this.templates.has(systemType.toUpperCase());
  }

  public getAll(): ISystemTemplate[] {
    return Array.from(this.templates.values());
  }

}
