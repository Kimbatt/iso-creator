<script
    module
    lang="ts"
>
    let dialogVisible = $state(false);
    let dialogTitle = $state("");
    let dialogMessage: string | null = $state("");
    let dialogButtons: string[] = $state([]);
    let dialogHasInputText = $state(false);
    let dialogInputText = $state("");

    let dialogConfirmButtonIndex: number | null = 0;

    let textInputElement: HTMLInputElement;

    let buttonClickResolver = (_: number) => {};

    interface ShowDialogResult<TButtons extends string[]> {
        button: TButtons[number];
        resultText?: string;
    }

    export async function showDialog<TButtons extends string[]>(
        title: string,
        message: string | null,
        buttons: TButtons,
        inputText?: string,
        confirmButton?: TButtons[number],
    ) {
        dialogVisible = true;
        dialogTitle = title;
        dialogMessage = message;
        dialogButtons = buttons;

        if (inputText !== undefined) {
            dialogHasInputText = true;
            dialogInputText = inputText;

            // Auto-select all text
            // Need to delay until the text field input actually becomes visible
            queueMicrotask(() => textInputElement.select());
        } else {
            dialogHasInputText = false;
        }

        if (confirmButton !== undefined) {
            dialogConfirmButtonIndex = buttons.indexOf(confirmButton);
        } else {
            dialogConfirmButtonIndex = null;
        }

        const buttonIndex = await new Promise<number>(res => {
            buttonClickResolver = res;
        });

        dialogVisible = false;

        const result: ShowDialogResult<TButtons> = {
            button: buttons[buttonIndex],
        };

        if (inputText !== undefined) {
            result.resultText = dialogInputText;
        }

        return result;
    }
</script>

<div
    class="fullscreen-overlay"
    style:display={dialogVisible ? null : "none"}
>
    <div class="dialog">
        <div class="text">{dialogTitle}</div>

        <input
            type="text"
            style:display={dialogHasInputText ? null : "none"}
            bind:this={textInputElement}
            bind:value={dialogInputText}
            onkeypress={ev => {
                if (ev.key === "Enter" && dialogConfirmButtonIndex !== null) {
                    buttonClickResolver(dialogConfirmButtonIndex);
                }
            }}
        />

        {#if dialogMessage !== null}
            <div class="text">{dialogMessage}</div>
        {/if}

        <div class="buttons">
            {#each dialogButtons as buttonText, index}
                <button onclick={() => buttonClickResolver(index)}>
                    {buttonText}
                </button>
            {/each}
        </div>
    </div>
</div>

<style lang="scss">
    @use "./Constants.scss" as c;

    .fullscreen-overlay {
        position: absolute;
        top: 0px;
        left: 0px;
        width: 100vw;
        height: 100vh;
        height: 100dvh;

        background-color: rgba($color: #000000, $alpha: 0.8);
        backdrop-filter: blur(5px);

        display: flex;
        justify-content: center;
        align-items: center;
    }

    .dialog {
        background-color: c.$color-background;
        border: 2px solid c.$color-border;
        border-radius: calc(c.$default-border-radius * 2);

        padding: 16px;
        margin: 16px;
        gap: 32px;

        max-width: 100vw;
        width: 450px;

        display: flex;
        flex-direction: column;
        align-items: stretch;
    }

    .buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;

        gap: 8px;

        direction: rtl;
    }

    .text {
        white-space: pre-line;
        overflow: auto;
        max-height: 200px;
    }
</style>
