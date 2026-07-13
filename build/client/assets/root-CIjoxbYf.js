import{u as m,a as y,b as x,c as f,r as i,_ as j,j as e,M as S,L as w,O as g,S as k}from"./components-Df0w2LiA.js";/**
 * @remix-run/react v2.16.5
 *
 * Copyright (c) Remix Software Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */let a="positions";function M({getKey:r,...l}){let{isSpaMode:c}=m(),n=y(),p=x();f({getKey:r,storageKey:a});let u=i.useMemo(()=>{if(!r)return null;let t=r(n,p);return t!==n.key?t:null},[]);if(c)return null;let d=((t,h)=>{if(!window.history.state||!window.history.state.key){let s=Math.random().toString(32).slice(2);window.history.replaceState({key:s},"")}try{let o=JSON.parse(sessionStorage.getItem(t)||"{}")[h||window.history.state.key];typeof o=="number"&&window.scrollTo(0,o)}catch(s){console.error(s),sessionStorage.removeItem(t)}}).toString();return i.createElement("script",j({},l,{suppressHydrationWarning:!0,dangerouslySetInnerHTML:{__html:`(${d})(${JSON.stringify(a)}, ${JSON.stringify(u)})`}}))}function b(){return i.useEffect(()=>{(function(){emailjs.init({publicKey:"q6ITPQW2dDGcPkce9"})})()},[]),e.jsxs("html",{lang:"en",children:[e.jsxs("head",{children:[e.jsx("meta",{charSet:"utf-8"}),e.jsx("meta",{name:"viewport",content:"width=device-width,initial-scale=1"}),e.jsx("link",{rel:"preconnect",href:"https://cdn.shopify.com/"}),e.jsx("link",{rel:"stylesheet",href:"https://cdn.shopify.com/static/fonts/inter/v4/styles.css"}),e.jsx(S,{}),e.jsx(w,{})]}),e.jsxs("body",{children:[e.jsx(g,{}),e.jsx(M,{}),e.jsx(k,{}),e.jsx("script",{type:"text/javascript",src:"https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"})]})]})}export{b as default};
