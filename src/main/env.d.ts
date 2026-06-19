/** electron-vite copies these files to the build output and resolves the
 *  import to the runtime file path (works in dev and packaged asar). */
declare module '*?asset' {
  const path: string
  export default path
}
