'use client';

import dynamic from 'next/dynamic';

const VendorsPage = dynamic(
  () => import('apps/rahat-ui/src/sections/projects/aa-2/vendor').then((mod) => mod.AAVendorsView),
  {
    ssr: false,
  },
);

export default function Page() {
  return <VendorsPage />;
}
