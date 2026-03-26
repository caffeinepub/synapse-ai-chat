declare module "html2canvas" {
  interface Options {
    useCORS?: boolean;
    allowTaint?: boolean;
    scale?: number;
    logging?: boolean;
    backgroundColor?: string | null;
    [key: string]: unknown;
  }
  function html2canvas(
    element: HTMLElement,
    options?: Options,
  ): Promise<HTMLCanvasElement>;
  export default html2canvas;
}
