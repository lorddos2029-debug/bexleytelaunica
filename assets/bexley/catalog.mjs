export const catalog={vibration:{id:'vibration',name:'Body Splash Masculino Vibration 200ml by Primacial',shortName:'Body Splash Vibration · 200ml',price:3990,colors:['Vibration'],images:{Vibration:'/assets/bexley/vibration-6.png'}}};
export const productFor=item=>catalog[item.productId||'vibration'];
export const validItem=item=>!!productFor(item)&&productFor(item).colors.includes(item.color)&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=99;
export const pixUnitPrice=item=>productFor(item).price;
