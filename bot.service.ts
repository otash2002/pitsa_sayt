import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Bot, session, Context, SessionFlavor } from 'grammy';
import { PrismaService } from "../prisma/prisma.service";

// ========================================
// INTERFEYSLAR
// ========================================

// Session interfeysi
interface SessionData {
  cart: CartData | null;
  phone: string;
  orderType: string;
  location: { latitude: number; longitude: number } | null;
  addressText: string;
  lastAction: string;
}

// Web App'dan keladigan ma'lumotlar uchun interfeys
interface CartData {
  items: {
    name: string;
    quantity: number;
    price: number;
    total_price: number;
  }[];
  total_amount: number;
}

type MyContext = Context & SessionFlavor<SessionData>;

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private bot: Bot<MyContext>;
  private readonly ADMIN_ID: string;
  private readonly WEB_APP_URL = "https://otash2002.github.io/prezto_pizza_bot/";

  constructor(private prisma: PrismaService) {
    if (!process.env.BOT_TOKEN) {
      throw new Error('BOT_TOKEN topilmadi! .env faylni tekshiring');
    }
    if (!process.env.ADMIN_ID) {
      throw new Error('ADMIN_ID topilmadi! .env faylni tekshiring');
    }

    this.ADMIN_ID = process.env.ADMIN_ID;
    this.bot = new Bot<MyContext>(process.env.BOT_TOKEN);
  }

  async onModuleInit() {
    console.log('🤖 Bot sozlanmoqda...');

    try {
      this.bot.use(
        session({
          initial: (): SessionData => ({
            cart: null,
            phone: '',
            orderType: '',
            location: null,
            addressText: '',
            lastAction: 'menu',
          }),
        }),
      );

      this.setupCommands();
      this.setupHandlers();

      await this.bot.start({
        onStart: (botInfo) => {
          console.log(`✅ Bot ishga tushdi: @${botInfo.username}`);
        },
      });
    } catch (error) {
      console.error('❌ Bot sozlashda xatolik:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    console.log('🛑 Bot to\'xtatilmoqda...');
    await this.bot.stop();
    console.log('✅ Bot to\'xtatildi');
  }

  private setupCommands() {
    this.bot.command('start', async (ctx) => {
      try {
        await this.handleStart(ctx);
      } catch (error) {
        console.error('Start xatosi:', error);
        await ctx.reply('❌ Xatolik yuz berdi. Qaytadan /start yozing.');
      }
    });
  }

  private setupHandlers() {
    this.bot.on('message:contact', (ctx) => this.handleContact(ctx));
    this.bot.callbackQuery('type_delivery', (ctx) => this.handleDeliveryType(ctx));
    this.bot.callbackQuery('type_pickup', (ctx) => this.handlePickupType(ctx));
    this.bot.on('message:location', (ctx) => this.handleLocation(ctx));
    this.bot.on('message:web_app_data', (ctx) => this.handleWebAppData(ctx));
    this.bot.on('message:text', (ctx) => this.handleText(ctx));

    this.bot.callbackQuery(/^accept_(\d+)_(\d+)$/, (ctx) => this.handleAcceptOrder(ctx));
    this.bot.callbackQuery(/^reject_(\d+)$/, (ctx) => this.handleRejectOrder(ctx));
    this.bot.callbackQuery(/^contact_(\d+)$/, (ctx) => this.handleContactAdmin(ctx));

    this.bot.catch((err) => {
      console.error('❌ Bot global error:', err.message, err);
    });
  }

  // ========================================
  // ASOSIY HANDLER METODLARI
  // ========================================

  private async handleStart(ctx: MyContext) {
    ctx.session = { cart: null, phone: '', orderType: '', location: null, addressText: '', lastAction: 'registration' };

    await this.prisma.user.upsert({
      where: { telegramId: ctx.from.id.toString() },
      update: {},
      create: {
        telegramId: ctx.from.id.toString(),
        phone: '',
        name: ctx.from.first_name || 'Foydalanuvchi',
      },
    });

    await ctx.reply(
      '🍕 *Presto Pizza*ga xush kelibsiz!\n\nBuyurtma berish uchun, iltimos, telefon raqamingizni yuboring:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [[{ text: '📞 Raqamni yuborish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  private async handleContact(ctx: MyContext) {
    if (!ctx.message?.contact) return;
    const phone = ctx.message.contact.phone_number.replace('+', '');
    ctx.session.phone = phone;

    await this.prisma.user.update({
      where: { telegramId: ctx.from.id.toString() },
      data: { phone },
    });

    await ctx.reply('✅ Rahmat! Endi xizmat turini tanlang:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚖 Yetkazib berish', callback_data: 'type_delivery' }, { text: '🛍 Olib ketish', callback_data: 'type_pickup' }],
        ],
      },
    });
  }

  private async handleDeliveryType(ctx: MyContext) {
    ctx.session.orderType = 'Yetkazib berish';
    ctx.session.lastAction = 'waiting_location';

    await ctx.answerCallbackQuery();
    await ctx.editMessageText('📍 *Yetkazib berish tanlandi*', { parse_mode: 'Markdown' });

    await ctx.reply(
      'Manzilni yuborish uchun *Lokatsiyani yuborish* tugmasini bosing yoki manzilni *matn ko\'rinishida yozib yuboring*:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [[{ text: '📍 Lokatsiyani yuborish', request_location: true }], [{ text: '🔙 Bekor qilish' }]],
          resize_keyboard: true,
        },
      },
    );
  }

  private async handlePickupType(ctx: MyContext) {
    ctx.session.orderType = 'Olib ketish';
    ctx.session.location = null;
    ctx.session.addressText = 'Filialdan olib ketish';
    ctx.session.lastAction = 'menu';

    await ctx.answerCallbackQuery();
    await ctx.editMessageText('🛍 *Olib ketish tanlandi*', { parse_mode: 'Markdown' });

    await this.sendMainMenu(ctx, '✅ Ma\'lumotlaringiz saqlandi.\n\nEndi "🍴 Menyu" tugmasi orqali buyurtma bering 👇');
  }

  private async handleLocation(ctx: MyContext) {
    if (ctx.session.lastAction !== 'waiting_location' || !ctx.message?.location) return;

    ctx.session.location = { latitude: ctx.message.location.latitude, longitude: ctx.message.location.longitude };
    ctx.session.addressText = 'Xaritadagi lokatsiya yuborildi';
    ctx.session.lastAction = 'menu';

    await this.sendMainMenu(ctx, '✅ Manzil qabul qilindi!\n\nEndi "🍴 Menyu" tugmasi orqali buyurtma bering 👇');
  }

  private async handleWebAppData(ctx: MyContext) {
    // 1-QADAM: Avval foydalanuvchi ro'yxatdan to'liq o'tganini tekshiramiz.
    const isFullyRegistered = ctx.session.phone && ctx.session.orderType && ctx.session.addressText;

    if (!isFullyRegistered) {
      await ctx.reply(
        '❌ Buyurtma berishdan oldin ro\'yxatdan o\'tishingiz kerak.\n\n' +
        'Iltimos, avval /start buyrug\'ini bosing va barcha amallarni bajaring. Shundan so\'ng menyudan qayta buyurtma bering.'
      );
      return;
    }
    
    // 2-QADAM: Agar ro'yxatdan o'tgan bo'lsa, veb-ilova ma'lumotlarini qayta ishlaymiz.
    if (!ctx.message?.web_app_data?.data) return;

    let data: CartData;
    try {
      data = JSON.parse(ctx.message.web_app_data.data);
    } catch (error) {
      console.error('WebApp JSON parse xatosi:', error);
      await ctx.reply('❌ Buyurtma ma\'lumotlarini o\'qishda xatolik yuz berdi.');
      return;
    }

    if (!data.items?.length) {
      await ctx.reply('❌ Savatingiz bo\'sh!');
      return;
    }
    
    // 3-QADAM: Savatni sessiyaga saqlab, buyurtmani darhol yakunlaymiz.
    ctx.session.cart = data;
    await this.finalizeOrder(ctx);
  }

  private async handleText(ctx: MyContext) {
    const text = ctx.message?.text;
    if (!text) return;

    if (ctx.session.lastAction === 'waiting_location' && text !== '🔙 Bekor qilish') {
      ctx.session.addressText = text;
      ctx.session.location = null;
      ctx.session.lastAction = 'menu';
      
      await this.sendMainMenu(ctx, `✅ Manzil qabul qilindi: *${text}*\n\nEndi "🍴 Menyu" tugmasi orqali buyurtma berishingiz mumkin.`);
      return;
    }

    switch (text) {
      case '🛒 Savat':
        await this.showCart(ctx);
        break;
      case '🔄 Qayta boshlash':
      case '🔙 Bekor qilish':
        await this.handleStart(ctx);
        break;
      case '📞 Aloqa':
        await ctx.reply('☎️ +998 94 677 75 90\n📍 Chartak sh., Alisher Navoiy ko\'chasi');
        break;
    }
  }

  // ========================================
  // YORDAMCHI METODLAR
  // ========================================

  private async finalizeOrder(ctx: MyContext) {
    if (!ctx.session.cart?.items?.length) {
      await ctx.reply('❌ Savatingiz bo\'sh. Iltimos, menyudan tanlang.');
      return;
    }
    if (!ctx.session.phone || !ctx.session.orderType || !ctx.session.addressText) {
      await ctx.reply('❌ Buyurtmani yakunlash uchun ma\'lumotlar yetarli emas. Iltimos, /start buyrug\'i bilan qayta boshlang.');
      return;
    }

    const { cart, phone, orderType, addressText, location } = ctx.session;
    const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Noma\'lum');
    
    let orderSummary = `🚀 *Yangi buyurtma!*\n\n`;
    orderSummary += `👤 *Mijoz:* ${username}\n`;
    orderSummary += `📞 *Telefon:* +${phone}\n`;
    orderSummary += `🚚 *Turi:* ${orderType}\n`;
    orderSummary += `📍 *Manzil:* ${addressText}\n\n`;
    
    cart.items.forEach((item, index) => {
      orderSummary += `${index + 1}. ${item.name} | ${item.quantity} ta = ${item.total_price.toLocaleString()} so'm\n`;
    });
    
    orderSummary += `\n💰 *JAMI: ${cart.total_amount.toLocaleString()} so'm*`;

    await this.bot.api.sendMessage(this.ADMIN_ID, orderSummary, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Qabul qilish', callback_data: `accept_${ctx.from.id}_${cart.total_amount}` }, { text: '❌ Rad etish', callback_data: `reject_${ctx.from.id}` }],
          [{ text: '📞 Aloqa', callback_data: `contact_${ctx.from.id}` }],
        ],
      },
    });

    if (location) {
      await this.bot.api.sendLocation(this.ADMIN_ID, location.latitude, location.longitude);
    }
    
    await ctx.reply(`✅ *Buyurtmangiz qabul qilindi!*\n💰 Jami: ${cart.total_amount.toLocaleString()} so'm\n\nTez orada siz bilan bog'lanamiz.`, {
      parse_mode: 'Markdown',
    });
    
    ctx.session.cart = null; // Buyurtmadan so'ng savatni tozalaymiz.
    await this.sendMainMenu(ctx, 'Yangi buyurtma berish uchun "🍴 Menyu" tugmasini bosing.');
  }

  private async showCart(ctx: MyContext) {
    const { cart } = ctx.session;
    if (!cart?.items?.length) {
      await ctx.reply('🛒 Savatingiz bo\'sh. Buyurtma berish uchun "🍴 Menyu" tugmasini bosing.');
      return;
    }

    let text = '🛒 *Sizning savatingiz:*\n\n';
    cart.items.forEach((item, index) => {
      text += `${index + 1}. ${item.name} | ${item.quantity} ta × ${item.price.toLocaleString()} so'm = *${item.total_price.toLocaleString()} so'm*\n`;
    });
    text += `\n💰 *Jami: ${cart.total_amount.toLocaleString()} so'm*`;

    await ctx.reply(text, { parse_mode: 'Markdown' });
  }

  private async sendMainMenu(ctx: MyContext, text: string) {
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          [{ text: '🍴 Menyu', web_app: { url: this.WEB_APP_URL } }, { text: '🛒 Savat' }],
          [{ text: '🔄 Qayta boshlash' }, { text: '📞 Aloqa' }],
        ],
        resize_keyboard: true,
      },
    });
  }

  // ========================================
  // ADMIN CALLBACK'LARI
  // ========================================

  private async handleAcceptOrder(ctx: MyContext) {
    const match = ctx.match;
    if (!match || !ctx.callbackQuery?.message) return;

    const [, userId, price] = match;
    await ctx.answerCallbackQuery('✅ Tasdiqlandi');
    await this.bot.api.sendMessage(userId, `✅ *Sizning buyurtmangiz qabul qilindi!*\n💰 Summa: ${parseInt(price).toLocaleString()} so'm\n⏰ Tez orada yetkazamiz.`, { parse_mode: 'Markdown' });
    await ctx.editMessageText((ctx.callbackQuery.message as any).text + '\n\n✅ *STATUS: QABUL QILINDI*', { parse_mode: 'Markdown' });
  }

  private async handleRejectOrder(ctx: MyContext) {
    const match = ctx.match;
    if (!match || !ctx.callbackQuery?.message) return;

    const [, userId] = match;
    await ctx.answerCallbackQuery('❌ Rad etildi');
    await this.bot.api.sendMessage(userId, '❌ *Kechirasiz, buyurtmangiz rad etildi.* Sababini aniqlashtirish uchun biz bilan bog\'laning.', { parse_mode: 'Markdown' });
    await ctx.editMessageText((ctx.callbackQuery.message as any).text + '\n\n❌ *STATUS: RAD ETILDI*', { parse_mode: 'Markdown' });
  }

  private async handleContactAdmin(ctx: MyContext) {
    const match = ctx.match;
    if (!match) return;

    const user = await this.prisma.user.findUnique({ where: { telegramId: match[1] } });
    await ctx.answerCallbackQuery();
    await ctx.reply(`📞 Mijoz: +${user?.phone || 'Noma\'lum'}`);
  }
}
