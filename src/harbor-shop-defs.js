/** Actual stocked portions and prices shared by the economy and shop menus.
 * No rendering or simulation dependencies live in this module. */
export const HARBOR_SHOP_DEFS = Object.freeze([
  Object.freeze({ id: 'harbor-produce', buildingId: 'south-095', name: '潮叶果铺', product: 'produce', productName: '时令果蔬', price: 6, wholesale: 2, frontage: 'east' }),
  Object.freeze({ id: 'harbor-tea', buildingId: 'south-092', name: '静潮茶室', product: 'tea', productName: '港湾茶饮', price: 4, wholesale: 1, frontage: 'east' }),
  Object.freeze({ id: 'harbor-noodles', buildingId: 'south-090', name: '双碗面家', product: 'meal', productName: '热汤面', price: 7, wholesale: 3, frontage: 'south' }),
]);
