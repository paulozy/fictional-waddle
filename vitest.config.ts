import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // O Next resolve `server-only` em build time via alias interno, então o
      // pacote não existe em node_modules e não resolveria sob Vitest. Apontar
      // para o mesmo `empty.js` que o Next usa na camada de servidor mantém o
      // guard ativo no build real e inerte nos testes.
      "server-only": "next/dist/compiled/server-only/empty.js",
    },
  },
  test: {
    // A maior parte da suíte testa módulos puros de lib/ e Route Handlers, que
    // rodam em Node. Testes de componente pedem jsdom via docblock no arquivo:
    //   // @vitest-environment jsdom
    environment: "node",
    globals: true,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
