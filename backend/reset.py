import asyncio
from db import clear_all_data

async def main():
    await clear_all_data()

if __name__ == "__main__":
    asyncio.run(main())