export const getFormattedGlofasDate = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth() returns 0-based month, hence add 1
    const day = String(date.getDate()).padStart(2, '0');

    const formattedDate = `${year}-${month}-${day}T00:00:00`;

    return formattedDate
}