/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
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
