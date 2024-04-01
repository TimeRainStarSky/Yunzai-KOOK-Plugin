logger.info(logger.yellow("- 正在加载 KOOK 适配器插件"))

import makeConfig from "../../lib/plugins/config.js"
import fetch from "node-fetch"
import Kasumi from "kasumi.js"

const { config, configSave } = await makeConfig("KOOK", {
  tips: "",
  permission: "master",
  sendCardMsg: true,
  token: [],
}, {
  tips: [
    "欢迎使用 TRSS-Yunzai KOOK Plugin ! 作者：时雨🌌星空",
    "参考：https://github.com/TimeRainStarSky/Yunzai-KOOK-Plugin",
  ],
})

const adapter = new class KOOKAdapter {
  constructor() {
    this.id = "KOOK"
    this.name = "KOOKBot"
    this.version = `kasumi.js v0.5.14`
    this.card_theme = ["primary", "success", "danger", "warning", "info", "secondary", "none"]
  }

  async uploadFile(data, file) {
    return (await data.bot.sdk.API.asset.create(await Bot.Buffer(file))).data.url
  }

  makeButton(button, theme) {
    const msg = {
      type: "button",
      text: button.text,
      theme,
      ...button.KOOKBot,
    }

    if (button.input) {
      msg.click = "return-val"
      msg.value = JSON.stringify({ input: button.input, send: button.send })
    } else if (button.callback) {
      msg.click = "return-val"
      msg.value = JSON.stringify({ callback: button.callback })
    } else if (button.link) {
      msg.click = "link"
      msg.value = button.link
    } else return false

    return msg
  }

  makeButtons(button_square) {
    const modules = []
    let random = Math.floor(Math.random()*6)
    for (const button_row of button_square) {
      let elements = []
      for (let button of button_row) {
        button = this.makeButton(button, this.card_theme[random%6])
        if (button) {
          if (elements.length == 4) {
            modules.push({ type: "action-group", elements })
            elements = []
          }
          elements.push(button)
          random++
        }
      }
      if (elements.length)
        modules.push({ type: "action-group", elements })
    }
    return modules
  }

  async makeCardMsg(data, msg, raw) {
    if (!Array.isArray(msg))
      msg = [msg]
    const msgs = []
    const modules = []
    let msg_log = ""
    let quote
    let at

    for (let i of msg) {
      if (typeof i != "object")
        i = { type: "text", text: i }
      let src
      if (i.file)
        src = await this.uploadFile(data, i.file)

      let msg
      switch (i.type) {
        case "text":
          msg_log += `[文本：${i.text}]`
          modules.push({ type: "section", text: i.text })
          break
        case "image":
          msg_log += `[图片：${src}]`
          modules.push({ type: "container", elements: [{ type: "image", src }] })
          break
        case "record":
          msg_log += `[音频：${src}]`
          modules.push({ type: "audio", src })
          break
        case "video":
          msg_log += `[视频：${src}]`
          modules.push({ type: "video", src })
          break
        case "file":
          msg_log += `[文件：${src}]`
          modules.push({ type: "file", src })
        case "reply":
          msg_log += `[回复：${i.id}]`
          quote = i.id
          break
        case "at":
          msg_log += `[提及：${i.qq}]`
          at = i.qq.replace(/^ko_/, "")
          break
        case "node":
          for (const { message } of i.data) {
            const msg = await this.makeCardMsg(data, message, true)
            msg_log += msg.msg_log
            modules.push(...msg.modules)
            if (msg.quote) quote = msg.quote
            if (msg.at) at = msg.at
          }
          break
        case "button":
          msg_log += "[按钮]"
          modules.push(...this.makeButtons(i.data))
          break
        case "markdown":
          msg_log += `[Markdown：${i.data}]`
          modules.push({ type: "section", text: { type: "kmarkdown", content: i.data } })
          break
        case "raw":
          msg_log += `[原始消息：${JSON.stringify(i.data)}]`
          msgs.push(i.data)
          break
        default:
          i = JSON.stringify(i)
          msg_log += `[文本：${i}]`
          modules.push({ type: "section", text: i })
      }
    }

    if (raw) return { msg_log, modules, quote, at }
    if (modules.length) {
      const random = Math.floor(Math.random()*7)
      for (let i=0; i<modules.length; i+=50)
        msgs.push([10, JSON.stringify([{
          type: "card",
          theme: this.card_theme[(random+i/50)%7],
          modules: modules.slice(i, i+50),
        }]), quote, at])
    }
    return { msgs, msg_log }
  }

  async makeMsg(data, msg) {
    if (!Array.isArray(msg))
      msg = [msg]
    const msgs = []
    let msg_log = ""
    let quote
    let at

    for (let i of msg) {
      if (typeof i != "object")
        i = { type: "text", text: i }
      let file
      if (i.file)
        file = await this.uploadFile(data, i.file)

      let msg
      switch (i.type) {
        case "text":
          msg_log += `[文本：${i.text}]`
          msg = [1, i.text]
          break
        case "image":
          msg_log += `[图片：${file}]`
          msg = [2, file]
          break
        case "record":
          msg_log += `[音频：${file}]`
          msg = [8, file]
          break
        case "video":
          msg_log += `[视频：${file}]`
          msg = [3, file]
          break
        case "file":
          msg_log += `[文件：${file}]`
          msg = [4, file]
        case "reply":
          msg_log += `[回复：${i.id}]`
          quote = i.id
          continue
        case "at":
          msg_log += `[提及：${i.qq}]`
          at = i.qq.replace(/^ko_/, "")
          continue
        case "node":
          for (const { message } of i.data) {
            const msg = await this.makeMsg(data, message)
            msgs.push(...msg.msgs)
            msg_log += msg.msg_log
          }
          continue
        case "button":
          msg_log += "[按钮]"
          msg = [10, JSON.stringify([{ type: "card", modules: this.makeButtons(i.data) }])]
          break
        case "markdown":
          msg_log += `[Markdown：${i.data}]`
          msg = [9, i.data]
          break
        case "raw":
          msg_log += `[原始消息：${JSON.stringify(i.data)}]`
          msg = i.data
          break
        default:
          i = JSON.stringify(i)
          msg_log += `[文本：${i}]`
          msg = [1, i]
      }

      if (msg) {
        if (quote) msg[2] = quote
        if (at) msg[3] = at
        msgs.push(msg)
      }
    }
    return { msgs, msg_log }
  }

  async sendMsg(data, msg, send, log) {
    const rets = { message_id: [], data: [], error: [] }
    let msgs

    const sendMsg = async () => { for (const i of msgs.msgs) try {
      Bot.makeLog("debug", ["发送消息", i], data.self_id)
      const ret = await send(...i)
      Bot.makeLog("debug", ["发送消息返回", ret], data.self_id)

      if (ret.err) {
        Bot.makeLog("error", ["发送消息错误", i, ret.err], data.self_id)
        rets.error.push(ret.err)
        return false
      }

      rets.data.push(ret)
      if (ret.data?.msg_id)
        rets.message_id.push(ret.data.msg_id)
    } catch (err) {
      Bot.makeLog("error", ["发送消息错误", msg, err], data.self_id)
      rets.error.push(err)
      return false
    }}

    if (config.sendCardMsg)
      msgs = await this.makeCardMsg(data, msg)
    else
      msgs = await this.makeMsg(data, msg)

    log(msgs.msg_log)
    if (await sendMsg() === false) {
      msgs = await this.makeMsg(data, msg)
      await sendMsg()
    }
    return rets
  }

  sendFriendMsg(data, msg) {
    return this.sendMsg(data, msg,
      (type, content, quote) => data.bot.sdk.API.directMessage.create(type, data.user_id, content, quote),
      log => Bot.makeLog("info", [`发送好友消息：[${data.user_id}]`, log], data.self_id),
    )
  }

  sendGroupMsg(data, msg) {
    return this.sendMsg(data, msg,
      (type, content, quote, at) => data.bot.sdk.API.message.create(type, data.group_id, content, quote, at),
      log => Bot.makeLog("info", [`发送群消息：[${data.group_id}]`, log], data.self_id),
    )
  }

  async recallMsg(data, recall, message_id) {
    Bot.makeLog("info", `撤回消息：${message_id}`, data.self_id)
    if (!Array.isArray(message_id))
      message_id = [message_id]
    const msgs = []
    for (const i of message_id)
      msgs.push(await recall(i))
    return msgs
  }

  async getFriendInfo(data) {
    const i = (await data.bot.sdk.API.user.view(data.user_id)).data
    return {
      ...i,
      user_id: `ko_${i.id}`,
    }
  }

  async getMemberInfo(data) {
    const i = (await data.bot.sdk.API.user.view(data.user_id,
      (await this.getGroupInfo(data)).guild.id)).data
    return {
      ...i,
      user_id: `ko_${i.id}`,
    }
  }

  async getGroupInfo(data) {
    const channel = (await data.bot.sdk.API.channel.view(data.group_id)).data
    const guild = (await data.bot.sdk.API.guild.view(channel.guild_id)).data
    return {
      guild,
      channel,
      group_id: `ko_${channel.id}`,
      group_name: `${guild.name}-${channel.name}`,
    }
  }

  async getGroupArray(id) {
    const array = []
    for await (const i of Bot[id].sdk.API.guild.list()) for (const guild of i.data.items) try {
      for await (const i of Bot[id].sdk.API.channel.list(guild.id)) for (const channel of i.data.items)
        array.push({
          guild,
          channel,
          group_id: `ko_${channel.id}`,
          group_name: `${guild.name}-${channel.name}`,
        })
    } catch (err) {
      logger.error(`获取频道列表错误：${logger.red(err)}`)
    }
    return array
  }

  async getGroupList(id) {
    const array = []
    for (const { group_id } of (await this.getGroupArray(id)))
      array.push(group_id)
    return array
  }

  async getGroupMap(id) {
    for (const i of (await this.getGroupArray(id)))
      Bot[id].gl.set(i.group_id, i)
    return Bot[id].gl
  }

  pickFriend(id, user_id) {
    const i = {
      ...Bot[id].fl.get(user_id),
      self_id: id,
      bot: Bot[id],
      user_id: user_id.replace(/^ko_/, ""),
    }
    return {
      ...i,
      sendMsg: msg => this.sendFriendMsg(i, msg),
      recallMsg: message_id => this.recallMsg(i, message_id => i.bot.sdk.API.directMessage.delete(message_id), message_id),
      getInfo: () => this.getFriendInfo(i),
      getAvatarUrl: async () => (await this.getFriendInfo(i)).avatar,
    }
  }

  pickMember(id, group_id, user_id) {
    const i = {
      ...Bot[id].fl.get(user_id),
      self_id: id,
      bot: Bot[id],
      group_id: group_id.replace(/^ko_/, ""),
      user_id: user_id.replace(/^ko_/, ""),
    }
    return {
      ...this.pickFriend(id, user_id),
      ...i,
      getInfo: () => this.getMemberInfo(i),
      getAvatarUrl: async () => (await this.getMemberInfo(i)).avatar,
    }
  }

  pickGroup(id, group_id) {
    const i = {
      ...Bot[id].gl.get(group_id),
      self_id: id,
      bot: Bot[id],
      group_id: group_id.replace(/^ko_/, ""),
    }
    return {
      ...i,
      sendMsg: msg => this.sendGroupMsg(i, msg),
      recallMsg: message_id => this.recallMsg(i, message_id => i.bot.sdk.API.message.delete(message_id), message_id),
      getInfo: () => this.getGroupInfo(i),
      getAvatarUrl: async () => (await this.getGroupInfo(i)).guild.icon,
      pickMember: user_id => this.pickMember(id, group_id, user_id),
    }
  }

  makeMessage(id, event) {
    const data = {
      bot: Bot[id],
      self_id: id,
      raw: event,

      post_type: "message",
      user_id: `ko_${event.authorId}`,
      sender: event.author,
      message_id: event.messageId,

      message: [],
      raw_message: "",
    }
    data.bot.fl.set(data.user_id, data.sender)

    if (event.isMentionAll) {
      data.message.push({ type: "at", qq: "all" })
      data.raw_message += "[提及全体成员]"
    }

    if (event.isMentionHere) {
      data.message.push({ type: "at", qq: "online" })
      data.raw_message += "[提及在线成员]"
    }

    if (Array.isArray(event.mention))
      for (const i of event.mention) {
        data.message.push({ type: "at", qq: `ko_${i}` })
        data.raw_message += `[提及：ko_${i}]`
      }

    switch (event.messageType) {
      case 2:
        data.message.push({ type: "image", url: event.content })
        data.raw_message += `[图片：${event.content}]`
        break
      case 3:
        data.message.push({ type: "video", url: event.content })
        data.raw_message += `[视频：${event.content}]`
        break
      case 4:
        data.message.push({ type: "file", url: event.content })
        data.raw_message += `[文件：${event.content}]`
        break
      case 8:
        data.message.push({ type: "record", url: event.content })
        data.raw_message += `[音频：${event.content}]`
        break
      case 9: {
        const text = event.content.replace(/\(met\).+?\(met\)/g, "").replace(/\\(.)/g, "$1")
        data.message.push({ type: "text", text })
        data.raw_message += text
        break
      } default:
        data.message.push({ type: "text", text: event.content })
        data.raw_message += event.content
    }

    switch (event.channelType) {
      case "PERSON":
        data.message_type = "private"
        Bot.makeLog("info", `好友消息：[${data.sender.nickname}(${data.user_id})] ${data.raw_message}`, id)
        break
      case "GROUP":
        data.message_type = "group"
        data.group_id = `ko_${event.channelId}`
        data.group_name = event.rawEvent?.extra?.channel_name
        Bot.makeLog("info", `群消息：[${data.group_name}(${data.group_id}), ${data.sender.nickname}(${data.user_id})] ${data.raw_message}`, id)
        break
      case "BROADCAST":
        Bot.makeLog("info", `广播消息：${data.raw_message}`, id)
        break
      default:
        Bot.makeLog("warn", ["未知消息", event], id)
    }

    Bot.em(`${data.post_type}.${data.message_type}`, data)
  }

  makeMessageBtnClick(id, event) {
    const data = {
      bot: Bot[id],
      self_id: id,
      raw: event,

      post_type: "message",
      user_id: `ko_${event.authorId}`,
      sender: event.author,
      message_id: event.messageId,

      message: [{ type: "reply", id: event.targetMsgId }],
      raw_message: `[回复：${event.targetMsgId}]`,
    }
    data.bot.fl.set(data.user_id, data.sender)

    if (event.channelType == "GROUP") {
      data.message_type = "group"
      data.group_id = `ko_${event.channelId}`
      data.group_name = event.rawEvent?.extra?.channel_name
      Bot.makeLog("info", `群按钮点击事件：[${data.group_name}(${data.group_id}), ${data.sender.nickname}(${data.user_id})] ${data.raw_message} ${event.value}`, id)
    } else {
      data.message_type = "private"
      Bot.makeLog("info", `好友按钮点击事件：[${data.sender.nickname}(${data.user_id})] ${data.raw_message} ${event.value}`, id)
    }

    try {
      data.value = JSON.parse(event.value)
    } catch (err) {
      return Bot.makeLog("error", ["按钮点击事件解析错误", err], id)
    }

    if (data.value.input) {
      if (data.value.send) {
        data.message.push({ type: "text", text: data.value.input })
        data.raw_message += data.value.input
      } else {
        const msg = [
          segment.reply(event.targetMsgId),
          segment.markdown(`请输入\`${data.value.input}\``),
        ]
        if (data.message_type == "group")
          return data.bot.pickGroup(data.group_id).sendMsg(msg)
        else
          return data.bot.pickFriend(data.user_id).sendMsg(msg)
      }
    } else if (data.value.callback) {
      data.message.push({ type: "text", text: data.value.callback })
      data.raw_message += data.value.callback
    }
    Bot.em(`${data.post_type}.${data.message_type}`, data)
  }

  makeEvent(id, event) {
    switch (event.rawEvent?.extra?.type) {
      case "message_btn_click":
        this.makeMessageBtnClick(id, event)
        break
      default:
        //Bot.makeLog("warn", ["未知事件", event], id)
    }
  }

  async connect(token) {
    const bot = new Kasumi({ type: "websocket", token })
    bot.login = bot.connect
    await new Promise(resolve => {
      bot.once("connect.*", resolve)
      bot.login()
    })

    if (!bot.me?.userId) {
      logger.error(`${logger.blue(`[${token}]`)} ${this.name}(${this.id}) ${this.version} 连接失败`)
      return false
    }

    const id = `ko_${bot.me.userId}`
    Bot[id] = {
      adapter: this,
      sdk: bot,

      info: bot.me,
      uin: id,
      get nickname() { return this.info.username },
      get avatar() { return this.info.avatar },
      version: {
        id: this.id,
        name: this.name,
        version: this.version,
      },
      stat: { start_time: Date.now()/1000 },

      pickFriend: user_id => this.pickFriend(id, user_id),
      get pickUser() { return this.pickFriend },

      pickMember: (group_id, user_id) => this.pickMember(id, group_id, user_id),
      pickGroup: group_id => this.pickGroup(id, group_id),

      getGroupArray: () => this.getGroupArray(id),
      getGroupList: () => this.getGroupList(id),
      getGroupMap: () => this.getGroupMap(id),

      fl: new Map,
      gl: new Map,
      gml: new Map,
    }

    Bot[id].getGroupMap()
    Bot[id].sdk.on("message.*", data => this.makeMessage(id, data))
    Bot[id].sdk.on("event.*", data => this.makeEvent(id, data))

    logger.mark(`${logger.blue(`[${id}]`)} ${this.name}(${this.id}) ${this.version} 已连接`)
    Bot.em(`connect.${id}`, { self_id: id })
    return true
  }

  async load() {
    for (const token of config.token)
      await new Promise(resolve => {
        adapter.connect(token).then(resolve)
        setTimeout(resolve, 5000)
      })
  }
}

Bot.adapter.push(adapter)

export class KOOK extends plugin {
  constructor() {
    super({
      name: "KOOKAdapter",
      dsc: "KOOK 适配器设置",
      event: "message",
      rule: [
        {
          reg: "^#[Kk][Oo]+[Kk]?账号$",
          fnc: "List",
          permission: config.permission,
        },
        {
          reg: "^#[Kk][Oo]+[Kk]?设置.+$",
          fnc: "Token",
          permission: config.permission,
        }
      ]
    })
  }

  List() {
    this.reply(`共${config.token.length}个账号：\n${config.token.join("\n")}`, true)
  }

  async Token() {
    const token = this.e.msg.replace(/^#[Kk][Oo]+[Kk]?设置/, "").trim()
    if (config.token.includes(token)) {
      config.token = config.token.filter(item => item != token)
      this.reply(`账号已删除，重启后生效，共${config.token.length}个账号`, true)
    } else {
      if (await adapter.connect(token)) {
        config.token.push(token)
        this.reply(`账号已连接，共${config.token.length}个账号`, true)
      } else {
        this.reply(`账号连接失败`, true)
        return false
      }
    }
    await configSave()
  }
}

logger.info(logger.green("- KOOK 适配器插件 加载完成"))