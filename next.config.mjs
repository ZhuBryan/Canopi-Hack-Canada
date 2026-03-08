/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'rf-images-prod-bcdn.rentfaster.ca',
            },
        ],
    },
};

export default nextConfig;
