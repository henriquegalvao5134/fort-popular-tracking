/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Phone, MapPin, Clock, CheckCircle2, ShoppingCart, MessageCircle, Truck, ExternalLink, Instagram, X, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── WhatsApp tracking ─────────────────────────────────────────────────────
// Código único por page-load (G + 5 chars); gravado em D1 + Supabase no clique.
// Embutido invisível na mensagem (chars zero-width) — o n8n lê e casa com o D1.
const _WA_ALF  = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 chars, sem I O 0 1
const _WA_CODE = 'G' + Array.from({ length: 5 }, () =>
  _WA_ALF[Math.floor(Math.random() * _WA_ALF.length)]).join('');

function _codigoInvisivel(code: string): string {
  let s = '\uFEFF';
  for (const ch of code) {
    const n = _WA_ALF.indexOf(ch);
    for (let b = 4; b >= 0; b--) s += ((n >> b) & 1) ? '\u2060' : '\u200C';
  }
  return s + '\uFEFF';
}

const _WA_TEXT = 'Olá! Vim pelo Google. (Envie essa me' + _codigoInvisivel(_WA_CODE) + 'nsagem para atendimento prioritário!)';
const _WA_LINK = `https://wa.me/5521978859223?text=${encodeURIComponent(_WA_TEXT)}`;

// Parâmetros de rastreamento da URL (lidos 1x, na carga da página)
// gclid: URL > cookie _gclid (gravado pelo middleware na primeira visita com clique)
const _WA_P     = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const _getCookie = (name: string) =>
  (typeof document !== 'undefined' && document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')))?.[1] || '';
const _WA_GCLID = _WA_P.get('gclid')        || _getCookie('_gclid');
const _WA_GBRAID= _WA_P.get('gbraid')       || '';
const _WA_WBRAID= _WA_P.get('wbraid')       || '';
const _WA_FBCLID= _WA_P.get('fbclid')       || '';
const _WA_SRC   = _WA_P.get('utm_source')   || '';
const _WA_MED   = _WA_P.get('utm_medium')   || '';
const _WA_CMP   = _WA_P.get('utm_campaign') || '';
const _WA_CNT   = _WA_P.get('utm_content')  || '';
const _WA_TRM   = _WA_P.get('utm_term')     || '';
// ─────────────────────────────────────────────────────────────────────────

export default function App() {
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const whatsappLink = _WA_LINK;
  const trackWhatsApp = () => {
    // Google Ads conversion
    if (typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', 'conversion', { send_to: 'AW-18144522784/jajlCMqV8sQcEKDk_ctD' });
    }
    // Meta pixel browser-side (dedup com CAPI via event_id)
    const eventId = crypto.randomUUID();
    if (typeof (window as any).fbq === 'function') {
      (window as any).fbq('track', 'Contact', {}, { eventID: eventId });
    }
    // Server-side CAPI via tracking stack
    fetch('/tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event_name: 'Contact',
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: window.location.href,
        user_data: {},
      }),
    }).catch(() => {});
    // Registra clique no D1 com código + parâmetros de rastreamento
    const sid = (document.cookie.match(/(?:^|; )_krob_sid=([^;]*)/) || [])[1] || '';
    fetch('/api/wa-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        code:         _WA_CODE,
        gclid:        _WA_GCLID,
        gbraid:       _WA_GBRAID,
        wbraid:       _WA_WBRAID,
        fbclid:       _WA_FBCLID,
        utm_source:   _WA_SRC,
        utm_medium:   _WA_MED,
        utm_campaign: _WA_CMP,
        utm_content:  _WA_CNT,
        utm_term:     _WA_TRM,
        session_id:   sid,
      }),
    }).catch(() => {});
  };
  useEffect(() => {
    const pvEventId = crypto.randomUUID();
    if (typeof (window as any).fbq === 'function') {
      (window as any).fbq('track', 'PageView', {}, { eventID: pvEventId });
    }
    fetch('/tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event_name: 'PageView',
        event_id: pvEventId,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: window.location.href,
        user_data: {},
      }),
    }).catch(function () {});
  }, []);
  const mapsLink ="https://www.google.com/maps/place/Drogaria+FortPopular+Itaipua%C3%A7u/@-22.9621992,-42.9616469,17z/data=!3m1!4b1!4m6!3m5!1s0x998df432e9a709:0xede8f5152429cba7!8m2!3d-22.9621992!4d-42.9616469!16s%2Fg%2F11wtlpz2zg";

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 overflow-x-hidden">
      {/* Top Banner / Hero Section */}
      <header className="bg-white border-b border-red-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-1 group">
            <div className="bg-red-600 px-3 py-1 rounded-sm skew-x-[-10deg] border-2 border-yellow-400 shadow-md">
              <h1 className="text-xl md:text-2xl font-black text-white italic flex flex-col leading-none">
                <span className="text-[10px] tracking-[0.2em] font-bold">FARMÁCIAS</span>
                <span>FORT <span className="text-yellow-400 font-black">POPULAR</span></span>
              </h1>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <a href="tel:2136453003" className="flex items-center gap-2 text-red-600 font-black hover:text-red-700 transition-colors uppercase italic text-sm">
              <Phone size={18} />
              (21) 3645-3003
            </a>
            <a 
              href={whatsappLink} onClick={trackWhatsApp} 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-yellow-400 text-red-800 px-6 py-2.5 rounded-full font-black hover:bg-yellow-500 transition-all shadow-[0_4px_0_0_#b45309] active:translate-y-1 active:shadow-none flex items-center gap-2 text-sm italic"
            >
              <MessageCircle size={18} className="fill-red-800" />
              PEÇA AGORA
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section - Matching the Promotion Style */}
        <section className="relative py-16 md:py-24 bg-red-600 overflow-hidden">
          {/* Confetti/Circle patterns like in the images */}
          <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute top-10 right-10 w-24 h-24 border-8 border-white rounded-full"></div>
            <div className="absolute bottom-20 left-1/4 w-12 h-12 bg-white rounded-full"></div>
            <div className="absolute top-1/2 right-1/4 w-16 h-16 border-4 border-yellow-400 rotate-45"></div>
            <div className="absolute top-1/4 left-10 w-4 h-4 bg-yellow-400 rounded-full"></div>
          </div>
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="flex-1 text-center md:text-left text-white">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="inline-block bg-yellow-400 text-red-800 px-6 py-2 rounded-lg text-lg font-black mb-6 uppercase tracking-widest shadow-2xl rotate-[-2deg]">
                    Entrega GRÁTIS em Itaipuaçu
                  </div>
                  <h2 className="text-5xl md:text-7xl lg:text-8xl font-black italic uppercase leading-[0.85] mb-6 tracking-tighter shadow-red-900 drop-shadow-2xl">
                    Aqui, seu <span className="text-yellow-400">bem-estar</span> em primeiro lugar!
                  </h2>
                  <p className="text-xl md:text-2xl font-bold text-red-50 mb-10 max-w-2xl mx-auto md:mx-0 leading-tight">
                    Cuidar da sua saúde é nossa prioridade. Atendimento humanizado e o melhor preço de Maricá!
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-5 justify-center md:justify-start">
                    <a 
                      href={whatsappLink} onClick={trackWhatsApp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-4 bg-yellow-400 text-red-900 px-10 py-6 rounded-2xl text-2xl md:text-3xl font-black hover:bg-yellow-500 transition-all shadow-[0_8px_0_0_#b45309] hover:shadow-[0_10px_0_0_#b45309] transform hover:-translate-y-1 active:translate-y-0 active:shadow-none italic tracking-tighter"
                    >
                      <MessageCircle size={32} className="fill-red-900" />
                      FALAR NO WHATSAPP AGORA
                    </a>
                  </div>
                  
                  <div className="mt-12 flex flex-wrap items-center justify-center md:justify-start gap-6 font-black uppercase text-sm italic">
                    <span className="flex items-center gap-2 bg-red-700/50 px-3 py-1.5 rounded-full border border-red-500"><CheckCircle2 size={20} className="text-yellow-400" /> Medicamentos</span>
                    <span className="flex items-center gap-2 bg-red-700/50 px-3 py-1.5 rounded-full border border-red-500"><CheckCircle2 size={20} className="text-yellow-400" /> Perfumaria</span>
                    <span className="flex items-center gap-2 bg-white text-red-600 px-4 py-1.5 rounded-full shadow-lg">Pague com Mumbuca</span>
                  </div>
                </motion.div>
              </div>
              
              <div className="flex-1 relative mb-36 md:mb-0">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.7 }}
                  className="relative z-10"
                >
                  <div className="bg-yellow-400 rounded-[3rem] p-3 shadow-2xl relative overflow-hidden rotate-2">
                    <img 
                      src="https://i.postimg.cc/fbvwmY3v/Whats-App-Image-2026-04-28-at-15-27-08.jpg" 
                      alt="Medicamentos Fort Popular" 
                      className="rounded-[2.5rem] w-full object-cover object-top aspect-[4/3]"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Improved Delivery Badge - Outside overflow container to pop out */}
                  <div className="absolute -top-6 -right-4 md:-top-10 md:-right-8 bg-red-600 text-white p-5 md:p-6 rounded-full shadow-2xl font-black text-xs md:text-sm text-center leading-none animate-bounce border-4 border-yellow-400 z-30 rotate-12">
                    ENTREGA<br/>GRÁTIS
                  </div>
                </motion.div>
                
                {/* Floating Badge - Clickable */}
                <a 
                  href={whatsappLink} onClick={trackWhatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute -bottom-16 left-1/2 -translate-x-1/2 md:-bottom-10 md:-left-6 md:translate-x-0 z-20 bg-white p-4 md:p-6 rounded-[2rem] shadow-2xl border-4 border-red-600 -rotate-3 hover:scale-105 hover:rotate-0 transition-all cursor-pointer block w-[180px] md:w-auto"
                >
                   <div className="flex flex-col items-center gap-1 md:gap-2">
                      <Truck size={32} className="text-red-600 md:hidden" />
                      <Truck size={48} className="text-red-600 hidden md:block" />
                      <span className="text-red-600 font-black italic text-xs md:text-base leading-none">PEDIDOS WHATSAPP</span>
                      <span className="text-red-900 font-black text-[10px] md:text-xs leading-none">(21) 97885-9223</span>
                      <span className="text-red-700 font-black text-[8px] md:text-[10px] uppercase">ITAIPUAÇU</span>
                   </div>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Categories Section */}
        <section className="py-24 bg-white relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-20">
              <span className="text-red-600 font-black italic uppercase tracking-widest text-lg">Nossas Categorias</span>
              <h2 className="text-5xl md:text-6xl font-black text-slate-900 mt-2 italic uppercase tracking-tighter">O que você <span className="text-red-600 underline">precisa</span></h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
              {[
                { name: 'Medicamentos Éticos', desc: 'Referência e Segurança' },
                { name: 'Genéricos', desc: 'Preço Popular de Verdade' },
                { name: 'Produtos de Higiene', desc: 'Cuidado Completo' },
                { name: 'Perfumaria', desc: 'Sua Beleza em Dia' },
              ].map((item, idx) => (
                <div key={idx} className="bg-red-50 p-10 rounded-[2.5rem] border-2 border-transparent hover:border-red-500 hover:bg-white transition-all group shadow-sm hover:shadow-2xl text-center">
                  <div className="w-24 h-24 bg-red-600 text-yellow-400 rounded-[1.8rem] flex items-center justify-center mx-auto mb-8 shadow-[0_8px_0_0_#991b1b] group-hover:scale-110 group-hover:rotate-3 transition-all">
                    <ShoppingCart size={48} />
                  </div>
                  <h3 className="font-black text-red-900 text-2xl italic uppercase mb-3 leading-none">{item.name}</h3>
                  <p className="text-slate-500 font-bold">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Mumbuca Callout */}
        <section className="py-12 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
             <div className="bg-red-700 p-1.5 rounded-[3.5rem] border-4 border-yellow-400 shadow-2xl inline-block w-full">
                <div className="bg-red-700 p-10 md:p-14 rounded-[3.2rem] flex flex-col md:flex-row items-center justify-center gap-10">
                   <div className="bg-white p-6 rounded-3xl shadow-xl rotate-[-4deg] shrink-0 border-2 border-yellow-400">
                      <img 
                        src="https://i.postimg.cc/qqTXSVB7/101432227-137232447948680-6627897697581924352-n.png" 
                        alt="Banco Mumbuca" 
                        className="h-20 md:h-28 object-contain"
                        referrerPolicy="no-referrer"
                      />
                   </div>
                   <div className="max-w-xl">
                      <h3 className="text-4xl md:text-5xl font-black text-white italic mb-4 uppercase tracking-tighter leading-none">
                        PAGUE COM <span className="text-yellow-400 underline">MUMBUCA</span>
                      </h3>
                      <p className="text-red-50 font-black text-xl italic leading-tight">ORGULHO DE SER MARICÁ! APOIAMOS A ECONOMIA LOCAL E O MORADOR.</p>
                   </div>
                </div>
             </div>
          </div>
        </section>

        {/* Final CTA & Info */}
        <section className="py-24 bg-red-900 border-t-[12px] border-yellow-400 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none text-white text-9xl font-black italic uppercase leading-none overflow-hidden select-none">
            FORT POPULAR FORT POPULAR FORT POPULAR FORT POPULAR
          </div>
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid lg:grid-cols-12 gap-16 items-start">
              <div className="lg:col-span-7">
                <h2 className="text-5xl md:text-6xl font-black text-white italic mb-12 uppercase tracking-tighter">Onde nos <span className="text-yellow-400">encontrar</span></h2>
                
                <div className="grid sm:grid-cols-2 gap-12 mb-12">
                  <div className="space-y-12">
                    <a 
                      href="https://www.google.com/maps/place/Drogaria+FortPopular+Itaipua%C3%A7u/@-22.9621992,-42.9616469,17z/data=!3m1!4b1!4m6!3m5!1s0x998df432e9a709:0xede8f5152429cba7!8m2!3d-22.9621992!4d-42.9616469!16s%2Fg%2F11wtlpz2zg?entry=ttu&g_ep=EgoyMDI2MDQyMi4wIKXMDSoASAFQAw%3D%3D" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex gap-6 group hover:translate-x-2 transition-transform"
                    >
                      <div className="w-16 h-16 bg-red-600 text-yellow-400 rounded-2xl flex items-center justify-center shrink-0 shadow-2xl border-2 border-red-500 group-hover:bg-red-500">
                        <MapPin size={32} />
                      </div>
                      <div>
                        <p className="text-red-400 text-xs font-black uppercase tracking-[0.3em] mb-3">Localização</p>
                        <p className="text-2xl font-black text-white uppercase italic leading-none mb-1 group-hover:text-yellow-400 transition-colors">Jardim Atlântico</p>
                        <p className="text-xl font-black text-white italic">Maricá / RJ</p>
                        <p className="text-yellow-400 font-black text-sm mt-3">Em frente ao Terminal de Itaipuaçu</p>
                      </div>
                    </a>
                    
                    <div className="flex gap-6">
                      <div className="w-16 h-16 bg-red-600 text-yellow-400 rounded-2xl flex items-center justify-center shrink-0 shadow-2xl border-2 border-red-500">
                        <Clock size={32} />
                      </div>
                      <div>
                        <p className="text-red-400 text-xs font-black uppercase tracking-[0.3em] mb-3">Atendimento</p>
                        <p className="text-xl font-black text-white uppercase italic">SEG A SÁB: 07:00 - 22:00</p>
                        <p className="text-lg font-black text-red-200 italic">DOM: 07:00 - 21:00</p>
                        <p className="text-yellow-400 font-bold text-xs mt-1.5 uppercase tracking-wide">Feriados: Horário Normal</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-12">
                    <a href="tel:2136453003" className="flex gap-6 group hover:translate-x-2 transition-transform">
                      <div className="w-16 h-16 bg-red-600 text-yellow-400 rounded-2xl flex items-center justify-center shrink-0 shadow-2xl border-2 border-red-500 group-hover:bg-red-500">
                        <Phone size={32} />
                      </div>
                      <div>
                        <p className="text-red-400 text-xs font-black uppercase tracking-[0.3em] mb-3">Telefone e Entrega</p>
                        <p className="text-3xl font-black text-white italic leading-none group-hover:text-yellow-400 transition-colors">(21) 3645-3003</p>
                        <p className="text-red-300 font-bold text-sm mt-1">(Suporte Fixo)</p>
                      </div>
                    </a>

                    <a href={whatsappLink} onClick={trackWhatsApp} target="_blank" rel="noopener noreferrer" className="flex gap-6 group hover:translate-x-2 transition-transform">
                      <div className="w-16 h-16 bg-green-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-2xl border-2 border-green-400 group-hover:bg-green-400">
                        <MessageCircle size={32} className="fill-white" />
                      </div>
                      <div>
                        <p className="text-green-400 text-xs font-black uppercase tracking-[0.3em] mb-3">WhatsApp Vendas</p>
                        <p className="text-3xl font-black text-white italic leading-none group-hover:text-green-400 transition-colors">(21) 97885-9223</p>
                      </div>
                    </a>
                  </div>
                </div>

                {/* Google Maps Visual Section */}
                <div className="w-full h-80 bg-red-100 rounded-[3rem] p-2 border-2 border-red-500 shadow-2xl overflow-hidden group relative">
                  <iframe 
                    src="https://maps.google.com/maps?q=-22.9621992,-42.9616469(Vital%20Farma)&t=&z=17&ie=UTF8&iwloc=&output=embed" 
                    width="100%" 
                    height="100%" 
                    style={{ border: 0 }} 
                    allowFullScreen 
                    loading="lazy" 
                    referrerPolicy="no-referrer-when-downgrade"
                    className="rounded-[2.5rem]"
                  ></iframe>
                  
                  {/* Clickable Overlay for redirection */}
                  <a 
                    href={mapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 bg-transparent cursor-pointer flex items-center justify-center group/map"
                  >
                    <div className="hidden group-hover/map:flex absolute inset-0 bg-red-900/10 backdrop-blur-[1px] transition-all"></div>
                    
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-0 group-hover/map:scale-100 transition-transform duration-300">
                      <div className="bg-red-600 text-white px-8 py-4 rounded-full font-black text-xl italic shadow-2xl border-4 border-yellow-400 flex items-center gap-3 animate-pulse">
                        <MapPin size={24} />
                        VER NO GOOGLE
                      </div>
                    </div>
                  </a>

                  <div className="absolute bottom-6 right-6 pointer-events-none">
                     <div className="bg-red-600 text-white px-4 py-2 rounded-full text-xs font-black italic shadow-xl border-2 border-yellow-400 flex items-center gap-2">
                        <ExternalLink size={14} />
                        COMO CHEGAR
                     </div>
                  </div>
                </div>
              </div>
              
              <div className="lg:col-span-5">
                <div className="bg-white rounded-[3rem] p-12 text-slate-900 shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative border-b-[10px] border-yellow-400">
                  <div className="absolute -top-8 -left-8 w-24 h-24 bg-red-600 rounded-full flex items-center justify-center text-yellow-400 font-black italic rotate-[-15deg] border-4 border-white shadow-2xl text-xl">TOP!</div>
                  <h3 className="text-4xl font-black mb-6 italic uppercase text-red-600 tracking-tighter leading-[0.9]">Compre agora e receba rapidinho!</h3>
                  <p className="text-slate-600 font-bold mb-10 text-lg leading-snug">Seu pedido entregue com o carinho que sua família merece em toda Itaipuaçu.</p>
                  
                  <a 
                    href={whatsappLink} onClick={trackWhatsApp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-4 bg-[#25D366] text-white w-full py-7 rounded-[2rem] text-2xl font-black hover:opacity-90 transition-all shadow-[0_10px_0_0_#15803d] uppercase tracking-tighter hover:translate-y-[-2px] active:translate-y-[4px] active:shadow-none"
                  >
                    <MessageCircle size={40} className="fill-white" />
                    CHAMAR NO ZAP
                  </a>
                  
                  <div className="mt-10 flex flex-col items-center gap-4">
                     <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Aceitamos</p>
                     <div className="flex justify-center gap-8 grayscale opacity-50">
                        <img src="https://logodownload.org/wp-content/uploads/2014/07/visa-logo.png" alt="Visa" className="h-5" referrerPolicy="no-referrer"/>
                        <img src="https://logodownload.org/wp-content/uploads/2014/07/mastercard-logo.png" alt="Mastercard" className="h-5" referrerPolicy="no-referrer"/>
                        <img src="https://logodownload.org/wp-content/uploads/2019/12/elo-logo.png" alt="Elo" className="h-5" referrerPolicy="no-referrer"/>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-black text-white py-16">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="bg-red-600 inline-block px-8 py-3 rounded-xl mb-8 skew-x-[-15deg] border-2 border-yellow-400 shadow-2xl">
             <span className="text-2xl md:text-3xl font-black italic tracking-tighter">FORT POPULAR ITAIPUAÇU</span>
          </div>
          <p className="text-slate-400 font-bold text-base max-w-2xl mx-auto italic">O melhor atendimento da região. Medicamentos, Perfumaria e Conveniência com o preço que você pode pagar.</p>
          
          <div className="mt-12 flex justify-center gap-8 text-slate-500">
             <a href={whatsappLink} onClick={trackWhatsApp} target="_blank" rel="noopener noreferrer" className="hover:text-green-500 transition-colors">
               <MessageCircle size={24} />
             </a>
             <a href={whatsappLink} onClick={trackWhatsApp} target="_blank" rel="noopener noreferrer" className="hover:text-red-600 transition-colors">
               <Phone size={24} />
             </a>
             <a href="https://www.google.com/maps/place/Drogaria+FortPopular+Itaipua%C3%A7u/@-22.9621992,-42.9616469,17z/data=!3m1!4b1!4m6!3m5!1s0x998df432e9a709:0xede8f5152429cba7!8m2!3d-22.9621992!4d-42.9616469!16s%2Fg%2F11wtlpz2zg?entry=ttu&g_ep=EgoyMDI2MDQyMi4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noopener noreferrer" className="hover:text-yellow-400 transition-colors">
               <MapPin size={24} />
             </a>
          </div>
          
          <div className="mt-16">
            <span className="text-xs uppercase font-black tracking-[0.3em] text-yellow-400 bg-zinc-900/80 border border-zinc-800 px-6 py-3 rounded-full inline-flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
              Estamos em frente ao Terminal de Itaipuaçu
            </span>
          </div>
          
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-500/50 font-medium text-center">
              <span>© 2026 E. N. BORGES DROGARIA 90 LTDA — CNPJ 43.292.539/0001-74. Todos os direitos reservados.</span>
              <span className="hidden sm:inline opacity-30">•</span>
              <button 
                onClick={() => setShowPrivacyModal(true)}
                className="hover:text-red-500/80 transition-colors duration-300 font-medium cursor-pointer underline decoration-dotted underline-offset-2"
              >
                Política de Privacidade
              </button>
            </div>
            <a 
              href="https://www.instagram.com/henryquemachado_/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500/50 hover:text-red-500/80 transition-colors duration-300 font-medium tracking-wide"
            >
              <Instagram size={13} />
              <span>Desenvolvido por Henryque Machado</span>
            </a>
          </div>
        </div>
      </footer>

      {/* Persistent Floating Contact for Large Screens */}
      <div className="fixed bottom-10 left-10 z-[100] hidden xl:block">
         <a 
           href={whatsappLink} onClick={trackWhatsApp} 
           target="_blank" 
           rel="noopener noreferrer"
           className="bg-white p-4 rounded-3xl shadow-2xl border-4 border-red-600 flex items-center gap-4 animate-bounce hover:scale-105 transition-all cursor-pointer block"
         >
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-yellow-400">
               <Phone size={24} />
            </div>
            <div>
               <p className="text-[10px] font-black uppercase text-red-600 leading-none">WhatsApp Entrega</p>
               <p className="text-lg font-black text-slate-900 leading-none">(21) 97885-9223</p>
            </div>
         </a>
      </div>

      {/* Floating WhatsApp Button */}
      <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[200] flex items-center">
        <a 
          href={whatsappLink} onClick={trackWhatsApp} 
          target="_blank" 
          rel="noopener noreferrer"
          className="relative group flex items-center justify-center cursor-pointer"
        >
          {/* Subtle slow pulsing ring behind button */}
          <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-30 animate-pulse scale-110" />
          <span className="absolute inset-0 rounded-full bg-[#128C7E] opacity-20 animate-ping" />
          
          {/* Elegant tooltip that shows on hover and gently guides users */}
          <span className="absolute right-16 hidden sm:flex items-center bg-white text-slate-800 text-[11px] font-black tracking-wider uppercase px-4 py-2 rounded-full border border-slate-100 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
            Suporte Online
          </span>

          <div className="w-14 h-14 md:w-16 md:h-16 bg-gradient-to-tr from-[#128C7E] to-[#25D366] text-white rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(37,211,102,0.35)] hover:shadow-[0_12px_30px_rgba(37,211,102,0.55)] transform hover:scale-110 active:scale-95 transition-all duration-300">
            {/* Extremely precise and polished WhatsApp SVG */}
            <svg 
              viewBox="0 0 24 24" 
              className="w-7 h-7 md:w-8 md:h-8 fill-white transition-transform duration-300 group-hover:rotate-12"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12.012 2.25c-5.373 0-9.75 4.377-9.75 9.75 0 1.714.444 3.325 1.218 4.73l-1.3 4.743 4.862-1.275c1.372.748 2.94 1.177 4.606 1.177 5.373 0 9.75-4.377 9.75-9.75s-4.377-9.75-9.75-9.75zm5.12 13.84c-.213.6-1.233 1.192-1.785 1.25-.494.053-.984.227-3.155-.655-2.775-1.127-4.526-3.953-4.665-4.14-.138-.186-1.122-1.493-1.122-2.846 0-1.353.708-2.013.96-2.28.25-.268.55-.335.733-.335.184 0 .367.003.527.01.168.008.397-.062.62.476.228.548.784 1.91.85 2.046.067.135.111.293.02.476-.09.183-.135.293-.27.45-.135.158-.288.354-.412.475-.138.134-.282.28-.12.56.16.28.71 1.17 1.522 1.892.812.723 1.493.946 1.777 1.087.283.14.452.118.62-.075.168-.192.733-.853.931-1.144.198-.292.397-.244.67-.142.272.102 1.728.814 2.024.96.297.148.495.222.567.348.07.126.07.728-.143 1.328z"/>
            </svg>
          </div>
        </a>
      </div>

      {/* LGPD Privacy Policy Modal */}
      <AnimatePresence>
        {showPrivacyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[250] flex items-center justify-center p-4"
            onClick={() => setShowPrivacyModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-3xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-150 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-50 text-red-600 rounded-xl">
                    <Shield size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg md:text-xl font-bold text-slate-800">Política de Privacidade</h2>
                    <p className="text-[10px] text-slate-400 font-bold tracking-wider">VITAL FARMA • LGPD</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="p-2 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 overflow-y-auto space-y-6 text-slate-600 text-sm leading-relaxed">
                
                <div>
                  <p className="text-xs text-slate-400 font-bold mb-2">ÚLTIMA ATUALIZAÇÃO: 19/06/2026</p>
                  <p className="text-slate-600">
                    A sua privacidade é importante para nós. Esta Política de Privacidade descreve como a{' '}
                    <strong className="text-slate-800">E. N. BORGES DROGARIA 90 LTDA</strong>, nome fantasia{' '}
                    <strong className="text-slate-800">Vital Farma</strong>, inscrita no CNPJ sob nº{' '}
                    <strong className="text-slate-800">43.292.539/0001-74</strong>, com sede na Rua Georgilei Rodrigues,
                    3823, Loja 103 e 104, Lote 23 A1, Quadra 113, Jardim Atlântico Central, Maricá – RJ, CEP 24.934-170
                    ("nós", "nossa farmácia"), coleta, utiliza, armazena e protege os seus dados pessoais, em conformidade com
                    a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais – LGPD).
                  </p>
                  <p className="mt-3 text-slate-600">
                    Ao utilizar nosso site e fornecer seus dados, você declara estar ciente e de acordo com as práticas descritas
                    neste documento.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-2">1. Controlador dos dados</h3>
                  <p className="text-slate-600 mb-3">
                    O controlador responsável pelo tratamento dos seus dados pessoais é a{' '}
                    <strong className="text-slate-800">E. N. BORGES DROGARIA 90 LTDA (Vital Farma)</strong>.
                  </p>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-[13px] space-y-1.5">
                    <p className="font-semibold text-slate-700">Para questões relacionadas à proteção de dados, entre em contato:</p>
                    <p><span className="text-slate-400 font-medium">E-mail:</span> <a href="mailto:contato@assetecconsultoria.com" className="text-red-500 font-semibold hover:underline">contato@assetecconsultoria.com</a></p>
                    <p><span className="text-slate-400 font-medium">Telefone:</span> <span className="font-semibold text-slate-700">(21) 3989-1332</span></p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-3">2. Quais dados coletamos</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-1.5">2.1. Dados fornecidos por você</h4>
                      <p className="text-slate-600 mb-2">
                        Quando você preenche formulários no site, solicita atendimento ou entra em contato via WhatsApp, podemos coletar:
                      </p>
                      <ul className="list-disc pl-5 space-y-1 text-slate-600">
                        <li>Nome completo</li>
                        <li>E-mail</li>
                        <li>Telefone / WhatsApp</li>
                        <li>Mensagens e informações que você nos envia voluntariamente</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-1.5">2.2. Dados coletados automaticamente</h4>
                      <p className="text-slate-600 mb-2">
                        Ao navegar no site, coletamos por meio de cookies e tecnologias similares:
                      </p>
                      <ul className="list-disc pl-5 space-y-1 text-slate-600">
                        <li>Endereço IP</li>
                        <li>Tipo de navegador e dispositivo</li>
                        <li>Páginas visitadas e tempo de navegação</li>
                        <li>Origem do acesso (anúncios, redes sociais, buscas)</li>
                        <li>Identificadores de cookies e pixels de rastreamento</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-3">3. Como e por que usamos seus dados</h3>
                  <p className="text-slate-600 mb-4">
                    Tratamos seus dados pessoais apenas para finalidades específicas e com base legal adequada:
                  </p>
                  <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="p-3 font-semibold text-slate-700">Finalidade</th>
                          <th className="p-3 font-semibold text-slate-700">Base legal (LGPD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="p-3 text-slate-600">Entrar em contato e responder solicitações via WhatsApp</td>
                          <td className="p-3 font-medium text-emerald-600 bg-emerald-50/30">Consentimento</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="p-3 text-slate-600">Enviar promoções e comunicações sobre produtos e serviços</td>
                          <td className="p-3 font-medium text-emerald-600 bg-emerald-50/30">Consentimento</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="p-3 text-slate-600">Realizar e otimizar campanhas de anúncios</td>
                          <td className="p-3 font-medium text-blue-600 bg-blue-50/20">Legítimo interesse</td>
                        </tr>
                        <tr>
                          <td className="p-3 text-slate-600">Analisar o desempenho e melhorar o site</td>
                          <td className="p-3 font-medium text-blue-600 bg-blue-50/20">Legítimo interesse</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">Você pode revogar o consentimento a qualquer momento, conforme descrito no item 7.</p>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-2">4. Dados sensíveis</h3>
                  <p className="text-slate-600 mb-3">
                    Embora atuemos no segmento farmacêutico, nosso site tem a finalidade exclusiva de contato e atendimento. Não
                    coletamos, por meio do site, dados referentes a condições de saúde, receitas médicas, histórico de medicamentos
                    ou qualquer outro dado pessoal sensível nos termos do art. 5º, II da LGPD.
                  </p>
                  <p className="text-slate-600">
                    Caso você compartilhe voluntariamente informações de saúde em mensagens enviadas via formulário ou WhatsApp, esses
                    dados serão tratados com sigilo e utilizados exclusivamente para fins de atendimento.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-2">5. Cookies e tecnologias de rastreamento</h3>
                  <p className="text-slate-600 mb-3">
                    Utilizamos cookies e ferramentas de terceiros para medir resultados de campanhas e exibir anúncios relevantes:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 mb-3">
                    <li><strong className="text-slate-700">Meta Pixel / Conversions API (CAPI)</strong> – Meta Platforms (Facebook e Instagram)</li>
                    <li><strong className="text-slate-700">Google Analytics e Google Ads</strong> – Google LLC</li>
                  </ul>
                  <p className="text-slate-600">
                    Essas ferramentas coletam apenas dados de navegação e não têm acesso a informações de saúde. Você pode gerenciar
                    ou desativar cookies nas configurações do seu navegador.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-2">6. Com quem compartilhamos seus dados</h3>
                  <p className="text-slate-600 mb-2">
                    Seus dados podem ser compartilhados com:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600">
                    <li>Plataformas de anúncios (Meta e Google), exclusivamente para dados de navegação e mensuração de campanhas;</li>
                    <li>Fornecedores de tecnologia que auxiliam na operação do site e ferramentas de comunicação;</li>
                    <li>Autoridades públicas, quando exigido por lei ou decisão judicial.</li>
                  </ul>
                  <p className="mt-3 text-slate-600"><strong className="text-slate-800">Não vendemos seus dados pessoais a terceiros.</strong></p>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-2">7. Seus direitos como titular dos dados</h3>
                  <p className="text-slate-600 mb-3">
                    Nos termos do art. 18 da LGPD, você tem direito a:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
                    <li>Confirmar a existência de tratamento e acessar seus dados;</li>
                    <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
                    <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários;</li>
                    <li>Solicitar a portabilidade dos dados;</li>
                    <li>Eliminar os dados tratados com base no consentimento;</li>
                    <li>Obter informações sobre o compartilhamento dos seus dados;</li>
                    <li>Revogar o consentimento a qualquer momento.</li>
                  </ul>
                  <p className="mt-3 text-slate-600">
                    Para exercer qualquer um desses direitos, envie um e-mail para{' '}
                    <a href="mailto:contato@assetecconsultoria.com" className="text-red-500 font-semibold hover:underline">
                      contato@assetecconsultoria.com
                    </a>.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-2">8. Armazenamento e segurança</h3>
                  <p className="text-slate-600 mb-3">
                    Mantemos seus dados apenas pelo tempo necessário para cumprir as finalidades descritas nesta Política. Após esse
                    período, os dados são eliminados de forma segura.
                  </p>
                  <p className="text-slate-600">
                    Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados contra acessos não autorizados,
                    perda ou divulgação indevida. Em caso de incidente relevante, comunicaremos você e a Autoridade Nacional de Proteção
                    de Dados (ANPD).
                  </p>
                </div>

                <div className="border-t border-slate-150 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-2">9. Transferência internacional de dados</h3>
                  <p className="text-slate-600">
                    Algumas ferramentas que utilizamos (Meta e Google) podem processar dados em servidores fora do Brasil. Garantimos que
                    isso ocorra com base nas hipóteses legais da LGPD e com salvaguardas adequadas de proteção.
                  </p>
                </div>

                <div className="border-t border-slate-150 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-2">10. Alterações nesta Política</h3>
                  <p className="text-slate-600">
                    Esta Política pode ser updated periodicamente. A data da última atualização consta no início deste documento.
                  </p>
                </div>

                <div className="border-t border-slate-155 pt-5">
                  <h3 className="text-base font-bold text-slate-800 mb-3">11. Contato</h3>
                  <p className="text-slate-600 mb-3 font-medium">
                    Em caso de dúvidas sobre esta Política ou sobre o tratamento dos seus dados:
                  </p>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-2 text-[13px]">
                    <p className="font-bold text-red-600 uppercase text-xs tracking-wider">Vital Farma</p>
                    <p><span className="text-slate-400 font-medium">E-mail:</span> <a href="mailto:contato@assetecconsultoria.com" className="text-red-500 font-semibold hover:underline">contato@assetecconsultoria.com</a></p>
                    <p><span className="text-slate-400 font-medium">Telefone:</span> <span className="font-semibold text-slate-700">(21) 3989-1332 / (21) 3856-6443</span></p>
                    <p><span className="text-slate-400 font-medium">Endereço:</span> <span className="font-semibold text-slate-700">Rua Georgilei Rodrigues, 3823, Loja 103 e 104, Jardim Atlântico Central, Maricá – RJ</span></p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-5 text-center">
                  <p className="text-xs text-slate-400">Documento elaborado com base na Lei nº 13.759/2018 (LGPD).</p>
                </div>
              </div>

              {/* Footer Button */}
              <div className="p-4 border-t border-slate-150 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-sm px-6 py-2.5 rounded-2xl transition-colors cursor-pointer shadow-md shadow-red-600/10"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
