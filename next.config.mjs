/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "moon-bar-kitchen-new.vercel.app"
      }
    ]
  }
};

export default nextConfig;
