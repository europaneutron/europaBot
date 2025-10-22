/**
 * Tipos para Mensajes Fragmentados
 * Soporta múltiples tipos de contenido multimedia para WhatsApp
 */

// =====================================================
// TIPOS DE FRAGMENTOS
// =====================================================

export type FragmentType = 
  | 'text' 
  | 'image' 
  | 'video' 
  | 'document' 
  | 'location' 
  | 'audio' 
  | 'contact';

// =====================================================
// BASE FRAGMENT
// =====================================================

export interface BaseFragment {
  type: FragmentType;
  delay: number; // milisegundos de espera antes de enviar
}

// =====================================================
// FRAGMENTOS ESPECÍFICOS
// =====================================================

export interface TextFragment extends BaseFragment {
  type: 'text';
  content: string;
}

export interface ImageFragment extends BaseFragment {
  type: 'image';
  url: string;
  caption?: string;
}

export interface VideoFragment extends BaseFragment {
  type: 'video';
  url: string;
  caption?: string;
}

export interface DocumentFragment extends BaseFragment {
  type: 'document';
  url: string;
  filename: string;
  caption?: string;
}

export interface LocationFragment extends BaseFragment {
  type: 'location';
  latitude: number;
  longitude: number;
  name: string;
  address: string;
}

export interface AudioFragment extends BaseFragment {
  type: 'audio';
  url: string;
}

export interface ContactFragment extends BaseFragment {
  type: 'contact';
  name: string;
  phone: string;
  organization?: string;
}

// =====================================================
// UNION TYPE: Cualquier tipo de fragmento
// =====================================================

export type MessageFragment = 
  | TextFragment 
  | ImageFragment 
  | VideoFragment 
  | DocumentFragment 
  | LocationFragment 
  | AudioFragment 
  | ContactFragment;

// =====================================================
// RESPUESTA FRAGMENTADA
// =====================================================

export interface FragmentedResponse {
  fragments: MessageFragment[];
}

// =====================================================
// RESPUESTA DEL BOT: Simple o Fragmentada
// =====================================================

export type BotResponse = string | FragmentedResponse;

// =====================================================
// TYPE GUARDS: Verificar tipo en runtime
// =====================================================

export function isFragmentedResponse(response: BotResponse): response is FragmentedResponse {
  return typeof response === 'object' && 'fragments' in response;
}

export function isTextFragment(fragment: MessageFragment): fragment is TextFragment {
  return fragment.type === 'text';
}

export function isImageFragment(fragment: MessageFragment): fragment is ImageFragment {
  return fragment.type === 'image';
}

export function isVideoFragment(fragment: MessageFragment): fragment is VideoFragment {
  return fragment.type === 'video';
}

export function isDocumentFragment(fragment: MessageFragment): fragment is DocumentFragment {
  return fragment.type === 'document';
}

export function isLocationFragment(fragment: MessageFragment): fragment is LocationFragment {
  return fragment.type === 'location';
}

export function isAudioFragment(fragment: MessageFragment): fragment is AudioFragment {
  return fragment.type === 'audio';
}

export function isContactFragment(fragment: MessageFragment): fragment is ContactFragment {
  return fragment.type === 'contact';
}

// =====================================================
// VALIDACIÓN
// =====================================================

export function validateFragment(fragment: any): fragment is MessageFragment {
  if (!fragment || typeof fragment !== 'object') return false;
  if (typeof fragment.delay !== 'number') return false;
  if (!['text', 'image', 'video', 'document', 'location', 'audio', 'contact'].includes(fragment.type)) return false;
  
  // Validaciones específicas por tipo
  switch (fragment.type) {
    case 'text':
      return typeof fragment.content === 'string';
    case 'image':
    case 'video':
      return typeof fragment.url === 'string';
    case 'document':
      return typeof fragment.url === 'string' && typeof fragment.filename === 'string';
    case 'location':
      return (
        typeof fragment.latitude === 'number' &&
        typeof fragment.longitude === 'number' &&
        typeof fragment.name === 'string' &&
        typeof fragment.address === 'string'
      );
    case 'audio':
      return typeof fragment.url === 'string';
    case 'contact':
      return typeof fragment.name === 'string' && typeof fragment.phone === 'string';
    default:
      return false;
  }
}

export function validateFragmentedResponse(response: any): response is FragmentedResponse {
  if (!response || typeof response !== 'object') return false;
  if (!Array.isArray(response.fragments)) return false;
  return response.fragments.every(validateFragment);
}
