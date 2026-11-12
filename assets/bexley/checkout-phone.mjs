export function mobileDigits(value){let digits=String(value||'').replace(/\D/g,'');if(digits.length===13&&digits.startsWith('55'))digits=digits.slice(2);return digits.slice(0,11);}
export function formatMobile(value){const d=mobileDigits(value);if(!d)return '';if(d.length<3)return '('+d;return '('+d.slice(0,2)+') '+d.slice(2,7)+(d.length>7?'-'+d.slice(7):'');}
export const validMobile=value=>/^[1-9]\d{10}$/.test(mobileDigits(value));
export const vaulticPhone=value=>'55'+mobileDigits(value);
