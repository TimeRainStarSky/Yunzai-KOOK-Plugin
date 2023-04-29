logger.info(logger.yellow("- 正在加载 KOOK 插件"))

import { config, configSave } from "./Model/config.js"
import { Kasumi } from "kasumi.js"

const adapter = new class KOOKAdapter {
  async uploadFile(data, file) {
    if (file.match(/^base64:\/\//))
      return (await data.bot.API.asset.create(Buffer.from(file.replace(/^base64:\/\//, ""), "base64"))).data.url
    else if (file.match(/^https?:\/\//))
      return (await data.bot.API.asset.create(Buffer.from(await (await fetch(file)).arrayBuffer()))).data.url
    else
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
        i = { type: "text", data: { text: i }}
      else if (!i.data)
        i = { type: i.type, data: { ...i, type: undefined }}
      let ret
      switch (i.type) {
        case "text":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送文本：${i.data.text}`)
          ret = await send(1, i.data.text, quote, at)
          break
        case "image":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送图片：${i.data.file.replace(/^base64:\/\/.*/, "base64://...")}`)
          ret = await send(2, await this.uploadFile(data, i.data.file), quote, at)
          break
        case "record":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送音频：${i.data.file.replace(/^base64:\/\/.*/, "base64://...")}`)
          ret = await send(8, await this.uploadFile(data, i.data.file), quote, at)
          break
        case "video":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送视频：${i.data.file.replace(/^base64:\/\/.*/, "base64://...")}`)
          ret = await send(3, await this.uploadFile(data, i.data.file), quote, at)
          break
        case "reply":
          quote = i.data.id
          break
        case "at":
          at = i.data.qq.replace(/^ko_/, "")
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
      msgs.push(await recall(message_id))
    return msgs
  }

  async makeForwardMsg(data, send, msg) {
    const messages = []
    for (const i of msg)
      messages.push(await send(data, i.message))
    messages.data = "消息"
    return messages
  }

  makeMessage(data) {
    data.user_id = `ko_${data.authorId}`
    data.sender = data.author
    data.post_type = "message"
    data.message_id = data.messageId

    data.message = []
    data.raw_message = ""

    if (data.isMentionAll) {
      data.message.push({ type: "at", qq: "all" })
      data.raw_message += `[提及全体成员]`
    }

    if (data.isMentionHere) {
      data.message.push({ type: "at", qq: "all" })
      data.raw_message += `[提及在线成员]`
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
        data.friend = data.bot.pickFriend(data.user_id)
        break
      case "GROUP":
        data.message_type = "group"
        data.group_id = `ko_${data.channelId}`
        data.group_name = data.rawEvent?.extra?.channel_name

        logger.info(`${logger.blue(`[${data.self_id}]`)} 群消息：[${data.group_name}(${data.group_id}), ${data.sender.nickname}(${data.user_id})] ${data.raw_message}`)
        data.friend = data.bot.pickFriend(data.user_id)
        data.group = data.bot.pickGroup(data.group_id)
        data.member = data.group.pickMember(data.user_id)
        break
      case "BROADCAST":
        logger.info(`${logger.blue(`[${data.self_id}]`)} 广播消息：${data.raw_message}`)
        break
      default:
        logger.info(`${logger.blue(`[${data.self_id}]`)} 未知消息：${logger.red(JSON.stringify(data))}`)
    }

    data.reply = undefined

    Bot.emit(`${data.post_type}.${data.message_type}`, data)
    Bot.emit(`${data.post_type}`, data)
  }

  async connect(token) {
    const bot = new Kasumi({
      type: "websocket",
      vendor: "hexona",
      token
    })
    bot.connect()
    await new Promise(resolve => bot.once("connect.*", () => resolve()))

    if (!bot.me?.userId) {
      logger.error(`${logger.blue(`[${token}]`)} KOOKBot 连接失败`)
      return false
    }

    const id = `ko_${bot.me.userId}`
    Bot[id] = bot
    Bot[id].info = Bot[id].me
    Bot[id].uin = id
    Bot[id].nickname = Bot[id].info.username
    Bot[id].avatar = Bot[id].info.avatar
    Bot[id].version = {
      impl: "KOOKBot",
      version: config.package.dependencies["kasumi.js"],
      onebot_version: "v11",
    }
    Bot[id].stat = { start_time: Date.now()/1000 }
    Bot[id].fl = new Map()
    Bot[id].gl = new Map()

    Bot[id].pickFriend = user_id => {
      const i = { self_id: id, bot: Bot[id], user_id: user_id.replace(/^ko_/, "") }
      return {
        sendMsg: msg => this.sendFriendMsg(i, msg),
        recallMsg: message_id => this.recallMsg(i, message_id => i.bot.API.directMessage.delete(message_id), message_id),
        makeForwardMsg: msg => this.makeForwardMsg(i, this.sendFriendMsg, msg),
      }
    }
    Bot[id].pickUser = Bot[id].pickFriend

    Bot[id].pickMember = (group_id, user_id) => {
      const i = { self_id: id, bot: Bot[id], group_id: group_id.replace(/^ko_/, ""), user_id: user_id.replace(/^ko_/, "") }
      return {
        ...Bot[id].pickFriend(user_id),
      }
    }

    Bot[id].pickGroup = group_id => {
      const i = { self_id: id, bot: Bot[id], group_id: group_id.replace(/^ko_/, "") }
      return {
        sendMsg: msg => this.sendGroupMsg(i, msg),
        recallMsg: message_id => this.recallMsg(i, message_id => i.bot.API.message.delete(message_id), message_id),
        makeForwardMsg: msg => this.makeForwardMsg(i, this.sendGroupMsg, msg),
        pickMember: user_id => i.bot.pickMember(i.group_id, user_id),
      }
    }

    if (Array.isArray(Bot.uin)) {
      if (!Bot.uin.includes(id))
        Bot.uin.push(id)
    } else {
      Bot.uin = [id]
    }

    Bot[id].on("message.*", data => {
      data.self_id = id
      data.bot = Bot[id]
      this.makeMessage(data)
    })

    logger.mark(`${logger.blue(`[${id}]`)} KOOKBot 已连接`)
    Bot.emit(`connect.${id}`, Bot[id])
    Bot.emit(`connect`, Bot[id])
    return true
  }
}

Bot.once("online", async () => {
  for (const token of config.token)
    await adapter.connect(token)
})

export class KOOK extends plugin {
  constructor () {
    super({
      name: "KOOK账号设置",
      dsc: "KOOK账号设置",
      event: "message",
      rule: [
        {
          reg: "^#[Kk][Oo]账号$",
          fnc: "List",
          permission: "master"
        },
        {
          reg: "^#[Kk][Oo]设置.*$",
          fnc: "Token",
          permission: "master"
        }
      ]
    })
  }

  async List () {
    await this.reply(`共${config.token.length}个账号：\n${config.token.join("\n")}`, true)
  }

  async Token () {
    const token = this.e.msg.replace(/^#[Kk][Oo]设置/, "").trim()
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

logger.info(logger.green("- KOOK 插件 加载完成"))