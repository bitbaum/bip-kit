/**
 * Minimal ambient typing for the OPTIONAL `mermaid` peer. Not a devDep:
 * the package is ~large, only ever loaded in the browser, and only the two
 * calls below are used. Consumers who install mermaid get its real types in
 * their own code; this shim types our dynamic import only.
 */
declare module "mermaid" {
  interface MermaidApi {
    initialize(config: {
      startOnLoad?: boolean;
      theme?: string;
      themeVariables?: Record<string, string>;
      fontFamily?: string;
    }): void;
    render(id: string, code: string): Promise<{ svg: string }>;
  }
  const mermaid: MermaidApi;
  export default mermaid;
}
