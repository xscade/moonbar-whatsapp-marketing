import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        moon: {
          green: "#414C2F",
          red: "#BA401D",
          rust: "#BB5524",
          gold: "#7F6F34",
          yellow: "#FFDA7F",
          cream: "#F9E1CD",
          amber: "#E7A356",
          ink: "#1E2119",
          paper: "#FFF9F1"
        }
      },
      boxShadow: {
        soft: "0 20px 60px rgba(65, 76, 47, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
