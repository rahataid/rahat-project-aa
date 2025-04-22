// This function is to retrive token from interactive - url

export const retrive_token = (url_interactive: string) => {
    const url = new URL(url_interactive);
    return url.searchParams.get('token');
}