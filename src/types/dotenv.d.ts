declare module "dotenv" {
  export interface DotenvConfigOptions {
    path?: string;
    encoding?: string;
    debug?: boolean;
    override?: boolean;
  }

  export interface DotenvConfigOutput {
    error?: Error;
    parsed?: { [name: string]: string };
  }

  export function config(options?: DotenvConfigOptions): DotenvConfigOutput;
  export function parse(src: string | Buffer): { [name: string]: string };

  const dotenv: {
    config: typeof config;
    parse: typeof parse;
  };

  export default dotenv;
}
