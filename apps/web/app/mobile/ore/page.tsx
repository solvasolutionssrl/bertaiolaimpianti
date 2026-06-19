import { redirect } from 'next/navigation';

/**
 * Retro-compatibilità: la pagina "Le mie ore" è stata spostata sotto la shell
 * Kantiere (`/mobile/kantiere/ore`). I vecchi link (es. dalla schermata di
 * timbratura `/t/[token]`) restano funzionanti grazie a questo redirect.
 */
export default function MobileOreRedirect() {
  redirect('/mobile/kantiere/ore');
}
