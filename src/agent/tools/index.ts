import {dateTime} from './dateTime.ts'
import { readFile, listFiles, writeFile, deleteFile} from './file.ts'
// All tools combined for the agent
export const tools = {
    dateTime,
    readFile, writeFile, deleteFile, listFiles
};
