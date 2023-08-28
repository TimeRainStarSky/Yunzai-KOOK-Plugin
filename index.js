logger.info(logger.yellow("- 正在加载 KOOK 适配器插件"))

import { config, configSave } from "./Model/config.js"
import fetch from "node-fetch"
import { Kasumi } from "kasumi.js"

const adapter = new class KOOKAdapter {
  constructor() {
    this.id = "KOOK"
    this.name = "KOOKBot"
    this.version = `kasumi.js ${config.package.dependencies["kasumi.js"].replace("^", "v")}`
  }

  async uploadFile(data, file) {
    if (file.match(/^base64:\/\//))
      return (await data.bot.API.asset.create(Buffer.from(file.replace(/^base64:\/\//, ""), "base64"))).data.url
    else if (file.match(/^https?:\/\//))
      return (await data.bot.API.asset.create(Buffer.from(await (await fetch(file)).arrayBuffer()))).data.url
    return file
  }

  async sendMsg(data, send, msg) {
    if (!Array.isArray(msg))
      msg = [msg]
    const msgs = []
    const message_id = []
    let quote
    let at
    for (let i of msg) {
      if (typeof i != "object")
        i = { type: "text", text: i }

      let ret
      switch (i.type) {
        case "text":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送文本：${i.text}`)
          ret = await send(1, i.text, quote, at)
          break
        case "image":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送图片：${i.file.replace(/^base64:\/\/.*/, "base64://...")}`)
          ret = await send(2, await this.uploadFile(data, i.file), quote, at)
          break
        case "record":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送音频：${i.file.replace(/^base64:\/\/.*/, "base64://...")}`)
          ret = await send(8, await this.uploadFile(data, i.file), quote, at)
          break
        case "video":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送视频：${i.file.replace(/^base64:\/\/.*/, "base64://...")}`)
          ret = await send(3, await this.uploadFile(data, i.file), quote, at)
          break
        case "reply":
          quote = i.id
          break
        case "at":
          at = i.qq.replace(/^ko_/, "")
          break
        case "node":
          for (const ret of (await Bot.sendForwardMsg(msg => this.sendMsg(data, send, msg), i.data))) {
            msgs.push(...ret.data)
            message_id.push(...ret.message_id)
          }
          break
        default:
          i = JSON.stringify(i)
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送消息：${i}`)
          ret = await send(1, i, quote, at)
      }
      if (ret) {
        msgs.push(ret)
        if (ret.data?.msg_id)
          message_id.push(ret.data.msg_id)
      }
    }
    return { data: msgs, message_id }
  }

  sendFriendMsg(data, msg) {
    logger.info(`${logger.blue(`[${data.self_id}]`)} 发送好友消息：[${data.user_id}]`)
    return this.sendMsg(data, (type, content, quote) => data.bot.API.directMessage.create(type, data.user_id, content, quote), msg)
  }

  sendGroupMsg(data, msg) {
    logger.info(`${logger.blue(`[${data.self_id}]`)} 发送群消息：[${data.group_id}]`)
    return this.sendMsg(data, (type, content, quote, at) => data.bot.API.message.create(type, data.group_id, content, quote, at), msg)
  }

  async recallMsg(data, recall, message_id) {
    logger.info(`${logger.blue(`[${data.self_id}]`)} 撤回消息：${message_id}`)
    if (!Array.isArray(message_id))
      message_id = [message_id]
    const msgs = []
    for (const i of message_id)
      msgs.push(await recall(i))
    return msgs
  }

  async getFriendInfo(data) {
    const i = (await data.bot.API.user.view(data.user_id)).data
    return {
      ...i,
      user_id: `ko_${i.id}`,
    }
  }

  async getMemberInfo(data) {
    const i = (await data.bot.API.user.view(data.user_id,
      (await this.getGroupInfo(data)).guild.id)).data
    return {
      ...i,
      user_id: `ko_${i.id}`,
    }
  }

  async getGroupInfo(data) {
    const channel = (await data.bot.API.channel.view(data.group_id)).data
    const guild = (await data.bot.API.guild.view(channel.guild_id)).data
    return {
      guild,
      channel,
      group_id: `ko_${channel.id}`,
      group_name: `${guild.name}-${channel.name}`,
    }
  }

  async getGroupArray(id) {
    const array = []
    for await (const i of Bot[id].API.guild.list()) for (const guild of i.data.items) try {
      for await (const i of Bot[id].API.channel.list(guild.id)) for (const channel of i.data.items)
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
      recallMsg: message_id => this.recallMsg(i, message_id => i.bot.API.directMessage.delete(message_id), message_id),
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
      recallMsg: message_id => this.recallMsg(i, message_id => i.bot.API.message.delete(message_id), message_id),
      getInfo: () => this.getGroupInfo(i),
      getAvatarUrl: async () => (await this.getGroupInfo(i)).guild.icon,
      pickMember: user_id => this.pickMember(id, group_id, user_id),
    }
  }

  makeMessage(data) {
    data.bot = Bot[data.self_id]
    data.post_type = "message"
    data.user_id = `ko_${data.authorId}`
    data.sender = data.author
    data.bot.fl.set(data.user_id, data.sender)
    data.message_id = data.messageId

    data.message = []
    data.raw_message = ""

    if (data.isMentionAll) {
      data.message.push({ type: "at", qq: "all" })
      data.raw_message += "[提及全体成员]"
    }

    if (data.isMentionHere) {
      data.message.push({ type: "at", qq: "online" })
      data.raw_message += "[提及在线成员]"
    }

    if (Array.isArray(data.mention))
      for (const i of data.mention) {
        data.message.push({ type: "at", qq: `ko_${i}` })
        data.raw_message += `[提及：ko_${i}]`
      }

    switch (data.messageType) {
      case 2:
        data.message.push({ type: "image", url: data.content })
        data.raw_message += `[图片：${data.content}]`
        break
      case 3:
        data.message.push({ type: "video", url: data.content })
        data.raw_message += `[视频：${data.content}]`
        break
      case 4:
        data.message.push({ type: "file", url: data.content })
        data.raw_message += `[文件：${data.content}]`
        break
      case 8:
        data.message.push({ type: "record", url: data.content })
        data.raw_message += `[音频：${data.content}]`
        break
      case 9:
        data.content = data.content.replace(/\\(.)/g, "$1")
        data.message.push({ type: "text", text: data.content })
        data.raw_message += data.content
        break
      default:
        data.message.push({ type: "text", text: data.content })
        data.raw_message += data.content
    }

    switch (data.channelType) {
      case "PERSON":
        data.message_type = "private"
        logger.info(`${logger.blue(`[${data.self_id}]`)} 好友消息：[${data.sender.nickname}(${data.user_id})] ${data.raw_message}`)
        break
      case "GROUP":
        data.message_type = "group"
        data.group_id = `ko_${data.channelId}`
        data.group_name = data.rawEvent?.extra?.channel_name
        logger.info(`${logger.blue(`[${data.self_id}]`)} 群消息：[${data.group_name}(${data.group_id}), ${data.sender.nickname}(${data.user_id})] ${data.raw_message}`)
        break
      case "BROADCAST":
        logger.info(`${logger.blue(`[${data.self_id}]`)} 广播消息：${data.raw_message}`)
        break
      default:
        logger.info(`${logger.blue(`[${data.self_id}]`)} 未知消息：${logger.magenta(JSON.stringify(data))}`)
    }

    data.reply = undefined
    Bot.em(`${data.post_type}.${data.message_type}`, data)
  }

  async connect(token) {
    const bot = new Kasumi({ type: "websocket", token })
    bot.connect()
    await new Promise(resolve => bot.once("connect.*", resolve))

    if (!bot.me?.userId) {
      logger.error(`${logger.blue(`[${token}]`)} ${this.name}(${this.id}) ${this.version} 连接失败`)
      return false
    }

    const id = `ko_${bot.me.userId}`
    Bot[id] = bot
    Bot[id].adapter = this
    Bot[id].info = Bot[id].me
    Bot[id].uin = id
    Bot[id].nickname = Bot[id].info.username
    Bot[id].avatar = Bot[id].info.avatar
    Bot[id].version = {
      id: this.id,
      name: this.name,
      version: this.version,
    }
    Bot[id].stat = { start_time: Date.now()/1000 }

    Bot[id].pickFriend = user_id => this.pickFriend(id, user_id)
    Bot[id].pickUser = Bot[id].pickFriend

    Bot[id].pickMember = (group_id, user_id) => this.pickMember(id, group_id, user_id)
    Bot[id].pickGroup = group_id => this.pickGroup(id, group_id)

    Bot[id].getGroupArray = () => this.getGroupArray(id)
    Bot[id].getGroupList = () => this.getGroupList(id)
    Bot[id].getGroupMap = () => this.getGroupMap(id)

    Bot[id].fl = new Map
    Bot[id].gl = new Map
    Bot[id].gml = new Map
    Bot[id].getGroupMap()

    Bot[id].on("message.*", data => {
      data.self_id = id
      this.makeMessage(data)
    })

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

  async List() {
    await this.reply(`共${config.token.length}个账号：\n${config.token.join("\n")}`, true)
  }

  async Token() {
    const token = this.e.msg.replace(/^#[Kk][Oo]+[Kk]?设置/, "").trim()
    if (config.token.includes(token)) {
      config.token = config.token.filter(item => item != token)
      await this.reply(`账号已删除，重启后生效，共${config.token.length}个账号`, true)
    } else {
      if (await adapter.connect(token)) {
        config.token.push(token)
        await this.reply(`账号已连接，共${config.token.length}个账号`, true)
      } else {
        await this.reply(`账号连接失败`, true)
        return false
      }
    }
    configSave(config)
  }
}

logger.info(logger.green("- KOOK 适配器插件 加载完成"))