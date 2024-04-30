import axios from 'axios'

export const sendRequest = async (url: string) => {
    return axios.get(url);
}
