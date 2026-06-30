/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: '/widget.js',
        destination: '/api/widget.js',
      },
    ];
  },
};

export default nextConfig;
