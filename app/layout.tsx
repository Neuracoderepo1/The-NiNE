import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title:'THE NINE | A Persistent Artificial Society', description:'Nine artificial residents living through a persistent simulated world.' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
