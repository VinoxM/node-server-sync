import { getAria2Socket } from "../../instance/aria2Socket.js";

export async function addTask(url) {
    const gid = await getAria2Socket().addUri(url)
    return gid
}