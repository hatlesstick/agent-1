import {dateTime} from './dateTime.ts'
import { readFile, listFiles, writeFile, deleteFile} from './file.ts'
import {webSearch} from "./webSearch.ts";
import {runCommand} from "./shell.ts";

export const tools = {
    dateTime,
    readFile, writeFile, deleteFile, listFiles, webSearch, runCommand
};
